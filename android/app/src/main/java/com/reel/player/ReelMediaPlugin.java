package com.reel.player;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashMap;

/**
 * Reel's native music scanner. Reads the device's audio library from
 * MediaStore (title / artist / album / duration / path), extracts embedded
 * cover art into the app's private files dir, and returns the same track
 * descriptors the desktop folder scanner produces so the rest of the app
 * doesn't care which platform it is running on.
 */
@CapacitorPlugin(
    name = "ReelMedia",
    permissions = {
        @Permission(alias = "audio33", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notif", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class ReelMediaPlugin extends Plugin {

    private String lastArtKey = "";

    @Override
    public void load() {
        // Buttons pressed on the notification / lock screen travel back to the app as "mediaAction" events.
        ReelPlaybackService.setSink(new ReelPlaybackService.Sink() {
            @Override
            public void onAction(String action, long positionMs) {
                JSObject o = new JSObject();
                o.put("action", action);
                if (positionMs >= 0) o.put("position", positionMs / 1000.0);
                notifyListeners("mediaAction", o);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        // The WebView (and with it the audio) is going away: take the notification down with it.
        ReelPlaybackService.setSink(null);
        ReelPlaybackService.hide();
        super.handleOnDestroy();
    }

    /**
     * Shows / updates the lock-screen player. One call carries everything (song, position, play state, heart),
     * so the app only talks to the notification when something really changed.
     */
    @PluginMethod
    public void mediaUpdate(final PluginCall call) {
        final String artKey = call.getString("artKey", "");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        Double dur = call.getDouble("duration", 0.0);
        Double pos = call.getDouble("position", 0.0);
        Boolean playing = call.getBoolean("playing", false);
        Boolean liked = call.getBoolean("liked", false);
        final String artPath = call.getString("artPath");
        final String artData = call.getString("artData");

        boolean artChanged = !artKey.equals(lastArtKey);
        lastArtKey = artKey;
        ReelPlaybackService.writeState(artKey, title, artist, album,
            Math.round((dur != null ? dur : 0.0) * 1000.0), Math.round((pos != null ? pos : 0.0) * 1000.0),
            playing != null && playing.booleanValue(), liked != null && liked.booleanValue(), artChanged);
        ReelPlaybackService.refresh(getContext());
        call.resolve();

        if (artPath != null || artData != null) {
            // Cover art is decoded off the main thread, and only after the text is already on screen.
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Bitmap bmp = decodeArt(artPath, artData);
                    if (bmp != null) {
                        ReelPlaybackService.writeArt(artKey, bmp);
                        ReelPlaybackService.refresh(getContext());
                    }
                }
            }).start();
        }
    }

    /** Removes the lock-screen player (nothing is playing and the app does not want it shown). */
    @PluginMethod
    public void mediaHide(PluginCall call) {
        ReelPlaybackService.hide();
        call.resolve();
    }

    private Bitmap decodeArt(String artPath, String artData) {
        try {
            if (artData != null) {
                int comma = artData.indexOf(',');
                String b64 = comma >= 0 ? artData.substring(comma + 1) : artData;
                byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
                return decodeSampled(null, bytes);
            }
            if (artPath != null) {
                String p = artPath.startsWith("file://") ? artPath.substring(7) : artPath;
                return decodeSampled(p, null);
            }
        } catch (Throwable ignored) {
            // unreadable image: the notification simply has no cover
        }
        return null;
    }

    private Bitmap decodeSampled(String path, byte[] bytes) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        if (path != null) BitmapFactory.decodeFile(path, o);
        else BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        int sample = 1;
        int max = Math.max(o.outWidth, o.outHeight);
        while (max / sample > 600) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        if (path != null) return BitmapFactory.decodeFile(path, d);
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, d);
    }

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio33" : "audioLegacy";
    }

    private JSObject grantedResult(boolean granted) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        return r;
    }

    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (getPermissionState(permissionAlias()) == PermissionState.GRANTED) {
            call.resolve(grantedResult(true));
            return;
        }
        requestPermissionForAlias(permissionAlias(), call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(grantedResult(getPermissionState(permissionAlias()) == PermissionState.GRANTED));
    }

    /** Android 13+ needs a runtime OK before the media notification can show. */
    @PluginMethod
    public void ensureNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notif") == PermissionState.GRANTED) {
            call.resolve(grantedResult(true));
            return;
        }
        requestPermissionForAlias("notif", call, "notifPermissionCallback");
    }

    @PermissionCallback
    private void notifPermissionCallback(PluginCall call) {
        call.resolve(grantedResult(getPermissionState("notif") == PermissionState.GRANTED));
    }

    /** Are notifications actually allowed for Reel right now (permission + app-level switch)? */
    @PluginMethod
    public void notificationStatus(PluginCall call) {
        JSObject r = new JSObject();
        boolean on = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        r.put("enabled", on);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** Kept for compatibility: the window is the normal (non edge-to-edge) one, so there are no extra insets. */
    @PluginMethod
    public void getInsets(final PluginCall call) {
        JSObject r = new JSObject();
        r.put("top", 0);
        r.put("bottom", 0);
        call.resolve(r);
    }

    /** Opens Reel's own notification settings page so the user can switch them on. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open settings");
            }
        }
    }

    @PluginMethod
    public void scanAudio(final PluginCall call) {
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            call.reject("Permission to read audio files was not granted");
            return;
        }
        // Paths already in Reel's library: those songs are skipped (no cover-art work),
        // so rescanning after a few new downloads takes seconds, not minutes.
        final HashMap<String, Long> known = new HashMap<String, Long>();
        JSArray knownArr = call.getArray("known");
        if (knownArr != null) {
            for (int i = 0; i < knownArr.length(); i++) {
                Object k = knownArr.opt(i);
                if (k instanceof JSONObject) {
                    JSONObject ko = (JSONObject) k;
                    String kp = ko.optString("p", null);
                    if (kp != null) known.put(kp, Long.valueOf(ko.optLong("m", 0L)));
                } else if (k instanceof String) {
                    known.put((String) k, Long.valueOf(0L));
                }
            }
        }
        Integer minSec = call.getInt("minSeconds", 15);
        final int minSeconds = minSec != null ? Math.max(0, minSec.intValue()) : 15;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    call.resolve(doScan(known, minSeconds));
                } catch (Exception e) {
                    call.reject("Scan failed: " + e.getMessage());
                }
            }
        }).start();
    }

    private JSObject doScan(HashMap<String, Long> known, int minSeconds) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = Build.VERSION.SDK_INT >= 29
            ? MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATE_MODIFIED,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.SIZE
        };
        // Everything that is not a ringtone / alarm / notification sound and is at least
        // `minSeconds` long (the app's "skip short clips" setting; skips UI sounds and voice snippets).
        String selection = MediaStore.Audio.Media.IS_RINGTONE + " = 0 AND "
            + MediaStore.Audio.Media.IS_ALARM + " = 0 AND "
            + MediaStore.Audio.Media.IS_NOTIFICATION + " = 0 AND "
            + MediaStore.Audio.Media.DURATION + " >= " + (minSeconds * 1000L);
        String sort = MediaStore.Audio.Media.DATE_ADDED + " DESC";

        File artDir = new File(getContext().getFilesDir(), "art");
        if (!artDir.exists()) artDir.mkdirs();

        JSArray tracks = new JSArray();
        JSArray existing = new JSArray(); // every song that is on the phone right now (path, date added, modified)
        Cursor c = resolver.query(collection, projection, selection, null, sort);
        if (c != null) {
            try {
                int total = c.getCount();
                int idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int trackCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
                int dataCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int nameCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int modCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED);
                int addCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED);
                int sizeCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                int n = 0;
                while (c.moveToNext()) {
                    n++;
                    String path = c.getString(dataCol);
                    if (path == null || path.length() == 0) continue;
                    long modified = c.getLong(modCol);
                    long addedMs = c.getLong(addCol) * 1000L;
                    JSObject ex = new JSObject();
                    ex.put("p", path);
                    ex.put("a", addedMs);
                    ex.put("m", modified);
                    existing.put(ex);
                    Long knownMod = known.get(path);
                    boolean changed = knownMod != null && knownMod.longValue() > 0 && modified > knownMod.longValue();
                    if (knownMod != null && !changed) {
                        if (n % 50 == 0 || n == total) emitProgress(n, total);
                        continue;
                    }
                    long id = c.getLong(idCol);

                    String displayName = c.getString(nameCol);
                    String title = clean(c.getString(titleCol));
                    if (title == null) title = stripExtension(displayName != null ? displayName : new File(path).getName());
                    String artist = clean(c.getString(artistCol));
                    if (artist == null) artist = "Unknown Artist";
                    String album = clean(c.getString(albumCol));
                    File parent = new File(path).getParentFile();
                    // MediaStore fills a missing album tag with the folder name.
                    if (album == null || (parent != null && album.equals(parent.getName()))) album = "Local Files";
                    int trackNo = c.getInt(trackCol) % 1000;

                    JSObject t = new JSObject();
                    t.put("filePath", path);
                    t.put("title", title);
                    t.put("artist", artist);
                    t.put("album", album);
                    t.put("trackNo", trackNo > 0 ? (Object) Integer.valueOf(trackNo) : JSONObject.NULL);
                    t.put("duration", c.getLong(durCol) / 1000.0);
                    t.put("changed", changed);
                    t.put("dateAdded", addedMs);
                    t.put("modified", modified);
                    t.put("size", c.getLong(sizeCol));
                    String art = extractArt(resolver, artDir, id, modified, path, collection);
                    t.put("artPath", art != null ? (Object) art : JSONObject.NULL);
                    t.put("lyrics", JSONObject.NULL);
                    tracks.put(t);

                    if (n % 20 == 0 || n == total) emitProgress(n, total);
                }
            } finally {
                c.close();
            }
        }
        JSObject result = new JSObject();
        result.put("tracks", tracks);
        result.put("existing", existing);
        return result;
    }

    private void emitProgress(int scanned, int total) {
        JSObject p = new JSObject();
        p.put("scanned", scanned);
        p.put("total", total);
        notifyListeners("scanProgress", p);
    }

    private String clean(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.length() == 0 || t.equals("<unknown>")) return null;
        return t;
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    /** Embedded cover first; on Android 10+ fall back to the system thumbnail. */
    private String extractArt(ContentResolver resolver, File artDir, long id, long modified, String path, Uri collection) {
        File jpg = new File(artDir, id + "_" + modified + ".jpg");
        File png = new File(artDir, id + "_" + modified + ".png");
        File none = new File(artDir, id + "_" + modified + ".none"); // "looked, there is no art" marker
        if (jpg.exists()) return jpg.getAbsolutePath();
        if (png.exists()) return png.getAbsolutePath();
        if (none.exists()) return null;
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(path);
            byte[] pic = mmr.getEmbeddedPicture();
            if (pic != null && pic.length > 0) {
                boolean isPng = pic.length > 4 && (pic[0] & 0xFF) == 0x89 && pic[1] == 'P' && pic[2] == 'N' && pic[3] == 'G';
                File out = isPng ? png : jpg;
                FileOutputStream fos = new FileOutputStream(out);
                try { fos.write(pic); } finally { fos.close(); }
                return out.getAbsolutePath();
            }
        } catch (Exception ignored) {
            // unreadable / no embedded art — try the thumbnail below
        } finally {
            try { mmr.release(); } catch (Exception ignored) { }
        }
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                Uri uri = ContentUris.withAppendedId(collection, id);
                Bitmap bmp = resolver.loadThumbnail(uri, new Size(512, 512), null);
                if (bmp != null) {
                    FileOutputStream fos = new FileOutputStream(jpg);
                    try { bmp.compress(Bitmap.CompressFormat.JPEG, 88, fos); } finally { fos.close(); }
                    return jpg.getAbsolutePath();
                }
            } catch (Exception ignored) {
                // no thumbnail available
            }
        }
        try { none.createNewFile(); } catch (Exception ignored) { }
        return null;
    }
}
