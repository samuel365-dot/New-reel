package com.reel.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

/**
 * Reel's own lock-screen / notification player.
 *
 * A foreground "media playback" service that owns a MediaSession and the media notification:
 *   [heart] [previous] [play / pause] [next] [close]
 * The audio itself plays in the WebView (an HTML audio element); this service only shows the
 * controls and sends the button presses back to the app through {@link Sink}. The heart and the
 * close button are handled here as well, so they keep working with the screen off.
 */
public class ReelPlaybackService extends Service {

    /** Receives every button press (play, pause, next, prev, seekto, like, close). */
    public interface Sink {
        void onAction(String action, long positionMs);
    }

    public static final String ACTION_UPDATE = "com.reel.player.action.UPDATE";
    public static final String ACTION_PLAY = "com.reel.player.action.PLAY";
    public static final String ACTION_PAUSE = "com.reel.player.action.PAUSE";
    public static final String ACTION_NEXT = "com.reel.player.action.NEXT";
    public static final String ACTION_PREV = "com.reel.player.action.PREV";
    public static final String ACTION_LIKE = "com.reel.player.action.LIKE";
    public static final String ACTION_CLOSE = "com.reel.player.action.CLOSE";
    public static final String ACTION_DISMISSED = "com.reel.player.action.DISMISSED";

    private static final String CHANNEL_ID = "reel_playback";
    private static final int NOTIFICATION_ID = 4242;

    /** What the notification shows. Written by the plugin thread, read on the main thread. */
    public static final class State {
        public String artKey = "";
        public String title = "";
        public String artist = "";
        public String album = "";
        public Bitmap art = null;
        public long durationMs = 0;
        public long positionMs = 0;
        public boolean playing = false;
        public boolean liked = false;
    }

    private static final Object LOCK = new Object();
    private static final State STATE = new State();
    private static volatile Sink sink = null;
    private static volatile ReelPlaybackService instance = null;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private MediaSessionCompat session;
    private NotificationManager manager;
    private boolean inForeground = false;

    // ------------------------------------------------------------------ static API (used by the plugin)

    public static void setSink(Sink s) {
        sink = s;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    /** Copies new values into the shared state. Must be followed by {@link #refresh(Context)}. */
    public static void writeState(String artKey, String title, String artist, String album, long durationMs,
                                  long positionMs, boolean playing, boolean liked, boolean clearArt) {
        synchronized (LOCK) {
            STATE.artKey = artKey != null ? artKey : "";
            STATE.title = title != null ? title : "";
            STATE.artist = artist != null ? artist : "";
            STATE.album = album != null ? album : "";
            STATE.durationMs = Math.max(0, durationMs);
            STATE.positionMs = Math.max(0, positionMs);
            STATE.playing = playing;
            STATE.liked = liked;
            if (clearArt) STATE.art = null;
        }
    }

    public static void writeArt(String artKey, Bitmap bmp) {
        synchronized (LOCK) {
            // the song changed again while the cover was loading: drop it
            if (artKey == null || !artKey.equals(STATE.artKey)) return;
            STATE.art = bmp;
        }
    }

    private static boolean hasState() {
        synchronized (LOCK) {
            return STATE.playing || STATE.title.length() > 0;
        }
    }

    public static boolean currentlyPlaying() {
        synchronized (LOCK) {
            return STATE.playing;
        }
    }

    /** Shows / updates the notification (starts the service the first time, only while playing). */
    public static void refresh(final Context context) {
        final Context app = context.getApplicationContext();
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                ReelPlaybackService svc = instance;
                if (svc != null) {
                    svc.render();
                    return;
                }
                if (!currentlyPlaying()) return; // nothing to show yet: never start the service while paused
                try {
                    Intent i = new Intent(app, ReelPlaybackService.class);
                    i.setAction(ACTION_UPDATE);
                    ContextCompat.startForegroundService(app, i);
                } catch (Exception e) {
                    // the system refused (app in the background): the next update from the app will retry
                }
            }
        });
    }

    /** Removes the notification and stops the service (the close button, or the app asked for it). */
    public static void hide() {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                ReelPlaybackService svc = instance;
                if (svc != null) svc.closeNow();
            }
        });
    }

    private static void emit(String action, long positionMs) {
        Sink s = sink;
        if (s != null) {
            try {
                s.onAction(action, positionMs);
            } catch (Exception ignored) {
                // the app side must never crash the service
            }
        }
    }

    // ------------------------------------------------------------------ service

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Lock-screen and notification player");
            ch.setShowBadge(false);
            manager.createNotificationChannel(ch);
        }
        session = new MediaSessionCompat(this, "ReelSession");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", -1); }
            @Override public void onPause() { emit("pause", -1); }
            @Override public void onSkipToNext() { emit("next", -1); }
            @Override public void onSkipToPrevious() { emit("prev", -1); }
            @Override public void onSeekTo(long pos) { emit("seekto", pos); }
            @Override public void onStop() { handleClose(); }
            @Override
            public void onCustomAction(String action, android.os.Bundle extras) {
                if (ACTION_LIKE.equals(action)) emit("like", -1);
                else if (ACTION_CLOSE.equals(action)) handleClose();
            }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_MEDIA_BUTTON.equals(action)) {
            MediaButtonReceiver.handleIntent(session, intent);
            // handleIntent never calls startForeground: make sure the 5-second rule is met anyway
            render();
            if (!hasState()) closeNow(); // the app was not running: there is nothing to control
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action)) emit("play", -1);
        else if (ACTION_PAUSE.equals(action)) emit("pause", -1);
        else if (ACTION_NEXT.equals(action)) emit("next", -1);
        else if (ACTION_PREV.equals(action)) emit("prev", -1);
        else if (ACTION_LIKE.equals(action)) emit("like", -1);
        else if (ACTION_CLOSE.equals(action) || ACTION_DISMISSED.equals(action)) {
            handleClose();
            return START_NOT_STICKY;
        }
        // Started with startForegroundService(): a notification must be posted right now.
        render();
        if (!hasState()) closeNow();
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The app was swiped away from the recents list: the WebView (and the audio) goes with it, so the player goes too.
        closeNow();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        try {
            if (session != null) {
                session.setActive(false);
                session.release();
            }
        } catch (Exception ignored) {
            // already released
        }
        session = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ------------------------------------------------------------------ closing

    /** The close (x) button or a swipe-away: tell the app to pause, then remove everything. */
    private void handleClose() {
        emit("close", -1);
        closeNow();
    }

    private void closeNow() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {
            // not in the foreground
        }
        inForeground = false;
        try {
            if (manager != null) manager.cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {
            // nothing to cancel
        }
        synchronized (LOCK) {
            STATE.playing = false;
        }
        stopSelf();
    }

    // ------------------------------------------------------------------ drawing

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent i = new Intent(this, ReelPlaybackService.class);
        i.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, requestCode, i, flags);
    }

    private PendingIntent openAppIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) launch = new Intent();
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 0, launch, flags);
    }

    /** Pushes the shared state to the MediaSession and to the notification. Main thread only. */
    private void render() {
        if (session == null) return;
        State s = new State();
        synchronized (LOCK) {
            s.artKey = STATE.artKey; s.title = STATE.title; s.artist = STATE.artist; s.album = STATE.album;
            s.art = STATE.art; s.durationMs = STATE.durationMs; s.positionMs = STATE.positionMs;
            s.playing = STATE.playing; s.liked = STATE.liked;
        }

        // ---- media session (lock screen, Android 13+ media controls, headset buttons)
        MediaMetadataCompat.Builder md = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, s.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, s.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, s.album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, s.durationMs);
        if (s.art != null) md.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, s.art);
        session.setMetadata(md.build());

        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_SEEK_TO
            | PlaybackStateCompat.ACTION_STOP;
        PlaybackStateCompat.Builder pb = new PlaybackStateCompat.Builder()
            .setActions(actions)
            .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(
                ACTION_LIKE, s.liked ? "Remove from favorites" : "Add to favorites",
                s.liked ? R.drawable.ic_heart_filled : R.drawable.ic_heart_outline).build())
            .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(
                ACTION_CLOSE, "Close", R.drawable.ic_close).build())
            // Playing: the system moves the bar by itself (speed 1) from this position — no per-second updates needed.
            .setState(s.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                s.positionMs, s.playing ? 1.0f : 0.0f, SystemClock.elapsedRealtime());
        session.setPlaybackState(pb.build());

        // ---- notification: heart, previous, play/pause, next, close
        NotificationCompat.Builder nb = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(s.title.length() > 0 ? s.title : "Reel")
            .setContentText(s.artist)
            .setSubText(s.album.length() > 0 ? s.album : null)
            .setLargeIcon(s.art)
            .setContentIntent(openAppIntent())
            .setDeleteIntent(actionIntent(ACTION_DISMISSED, 7))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(true);

        nb.addAction(s.liked ? R.drawable.ic_heart_filled : R.drawable.ic_heart_outline,
            s.liked ? "Remove from favorites" : "Add to favorites", actionIntent(ACTION_LIKE, 1));
        nb.addAction(R.drawable.ic_skip_previous, "Previous", actionIntent(ACTION_PREV, 2));
        if (s.playing) {
            nb.addAction(R.drawable.ic_pause, "Pause", actionIntent(ACTION_PAUSE, 3));
        } else {
            nb.addAction(R.drawable.ic_play, "Play", actionIntent(ACTION_PLAY, 4));
        }
        nb.addAction(R.drawable.ic_skip_next, "Next", actionIntent(ACTION_NEXT, 5));
        nb.addAction(R.drawable.ic_close, "Close", actionIntent(ACTION_CLOSE, 6));

        nb.setStyle(new MediaStyle()
            .setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(0, 2, 3));

        Notification n = nb.build();
        try {
            if (!inForeground) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, n);
                }
                inForeground = true;
            } else {
                manager.notify(NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // Could not enter the foreground (for example the app is in the background and the system said no):
            // still show the notification so the controls are there.
            try {
                manager.notify(NOTIFICATION_ID, n);
            } catch (Exception ignored) {
                // notifications are blocked for the app
            }
        }
    }
}
