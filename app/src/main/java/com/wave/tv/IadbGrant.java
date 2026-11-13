package com.wave.tv;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;

import com.iadb.api.Container;

/**
 * One tap, no computer: Wave asks iAdb (an app that runs ADB on the phone itself, through Android
 * 11+ Wireless debugging) to grant Wave the DUMP permission for the signal-path panel's detail.
 * Written by hand from iAdb's own client (FileContainer/iAdb-api, MIT licence) instead of using its
 * libraries: only the four calls this needs.
 *
 *  1. iAdb hands Wave its connection when Wave starts: it calls this provider ("sendBinder") with
 *     the binder in a com.iadb.api.Container.
 *  2. Wave introduces itself (attachApplication); iAdb answers with whether Wave is allowed.
 *  3. Not yet: Wave asks (requestPermission); iAdb shows its Allow / Deny and answers.
 *  4. Allowed: Wave has iAdb run "pm grant <wave> android.permission.DUMP" once (newProcess), or for
 *     Single playback "cmd notification allow_dnd <wave>" (Do Not Disturb access).
 *
 * Only those two grants for Wave itself are ever run. Transaction numbers are iAdb's (its AIDL ids + 1).
 */
final class IadbGrant {
    interface Result {
        /** state: done, denied, unavailable, failed; text says what happened. */
        void result(String state, String text);
    }

    static final String MANAGER = "com.iadb.helper"; // the iAdb app
    private static final String SERVICE = "com.iadb.server.IIadbBinderService";
    private static final String APP = "com.iadb.server.IIadbBinderApplication";
    private static final String PROCESS = "com.iadb.server.IRemoteProcess";
    private static final String EXTRA_BINDER = "com.iadb.helper.api.extra.BINDER";
    private static final int T_NEW_PROCESS = 8, T_REQUEST_PERMISSION = 15, T_ATTACH = 18; // service
    private static final int T_BIND_APPLICATION = 2, T_PERMISSION_RESULT = 3; // to Wave
    private static final int T_WAIT_FOR = 4; // remote process
    private static final String ALLOWED = "iadb:r-p-r-a", GRANTED = "iadb:a-r-p-g";

    private static volatile IBinder server;
    private static volatile Boolean allowed; // from iAdb's answer to attachApplication
    private static Result pending;
    private static String pendingPackage;
    /** What iAdb runs once allowed: a grant for Wave (DUMP, or Do Not Disturb access). */
    private static String[] pendingCommand;
    private static String pendingDone;
    private static final Handler main = new Handler(Looper.getMainLooper());

    static boolean installed(Context c) {
        try {
            c.getPackageManager().getPackageInfo(MANAGER, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    static boolean connected() {
        IBinder b = server;
        return b != null && b.pingBinder();
    }

    /** iAdb's calls back to Wave: its first answer, and the Allow / Deny result. */
    private static final Binder APPLICATION = new Binder() {
        @Override
        protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
            if (code != T_BIND_APPLICATION && code != T_PERMISSION_RESULT) {
                try {
                    return super.onTransact(code, data, reply, flags);
                } catch (android.os.RemoteException e) {
                    return false;
                }
            }
            data.enforceInterface(APP);
            if (code == T_PERMISSION_RESULT) data.readInt(); // the request code
            Bundle b = data.readInt() != 0 ? Bundle.CREATOR.createFromParcel(data) : new Bundle();
            if (code == T_BIND_APPLICATION) {
                allowed = b.getBoolean(GRANTED, false);
            } else {
                boolean ok = b.getBoolean(ALLOWED, false);
                allowed = ok;
                main.post(() -> afterPermission(ok));
            }
            return true;
        }
    };

    /** The connection iAdb handed over (from the provider). */
    static void received(IBinder b, String packageName) {
        if (b == null || b == server) return;
        server = b;
        allowed = null;
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            Bundle args = new Bundle();
            args.putInt("iadb:a-av", 1);
            args.putString("iadb:a-pname", packageName);
            data.writeInterfaceToken(SERVICE);
            data.writeStrongBinder(APPLICATION);
            data.writeInt(1);
            args.writeToParcel(data, 0);
            b.transact(T_ATTACH, data, reply, 0);
            reply.readException();
        } catch (Exception ignored) {
            // Older or different iAdb: the grant button will say it isn't reachable.
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    /** The one-tap grant. Answers on the main thread. */
    static void grantDump(Context c, Result r) {
        grant(c, new String[]{"pm", "grant", c.getPackageName(), "android.permission.DUMP"},
                "Granted: the signal path now shows the details.", r);
    }

    /** Do Not Disturb access for Single playback, the same way. */
    static void grantDnd(Context c, Result r) {
        grant(c, new String[]{"cmd", "notification", "allow_dnd", c.getPackageName()},
                "Granted: Single playback can now silence calls and notifications.", r);
    }

    private static void grant(Context c, String[] command, String done, Result r) {
        String pkg = c.getPackageName();
        pendingCommand = command;
        pendingDone = done;
        if (!connected()) {
            r.result("unavailable", installed(c)
                    ? "iAdb isn't connected to Wave. Start iAdb (Wireless debugging on), then close and reopen Wave."
                    : "iAdb isn't installed.");
            return;
        }
        pendingPackage = pkg;
        if (Boolean.TRUE.equals(allowed)) {
            pending = r;
            runGrant();
            return;
        }
        pending = r;
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try { // iAdb shows its Allow / Deny; the answer comes to APPLICATION
            data.writeInterfaceToken(SERVICE);
            data.writeInt(1);
            server.transact(T_REQUEST_PERMISSION, data, reply, 0);
            reply.readException();
        } catch (Exception e) {
            pending = null;
            r.result("failed", "iAdb didn't answer.");
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    private static void afterPermission(boolean ok) {
        if (pending == null) return;
        if (!ok) {
            Result r = pending;
            pending = null;
            r.result("denied", "iAdb wasn't allowed, so nothing was granted.");
            return;
        }
        runGrant();
    }

    /** The grant, run once by iAdb (as the shell, which may grant these). Off the main thread. */
    private static void runGrant() {
        Result r = pending;
        String[] cmd = pendingCommand;
        String doneText = pendingDone;
        pending = null;
        new Thread(() -> {
            String state = "failed", text = "The grant didn't work.";
            Parcel data = Parcel.obtain(), reply = Parcel.obtain();
            try {
                data.writeInterfaceToken(SERVICE);
                data.writeStringArray(cmd);
                data.writeStringArray(null);
                data.writeString(null);
                server.transact(T_NEW_PROCESS, data, reply, 0);
                reply.readException();
                IBinder process = reply.readStrongBinder();
                int exit = -1;
                if (process != null) {
                    Parcel d2 = Parcel.obtain(), r2 = Parcel.obtain();
                    try {
                        d2.writeInterfaceToken(PROCESS);
                        process.transact(T_WAIT_FOR, d2, r2, 0);
                        r2.readException();
                        exit = r2.readInt();
                    } finally {
                        d2.recycle();
                        r2.recycle();
                    }
                }
                if (exit == 0) {
                    state = "done";
                    text = doneText;
                }
            } catch (Exception e) {
                text = "iAdb couldn't run the grant.";
            } finally {
                data.recycle();
                reply.recycle();
            }
            String s = state, t = text;
            main.post(() -> r.result(s, t));
        }).start();
    }

    /**
     * Where iAdb hands over its connection: content://(app id).iadb, "sendBinder". Only iAdb's
     * server (running as the shell) can call it: it needs INTERACT_ACROSS_USERS_FULL.
     */
    public static final class Provider extends ContentProvider {
        @Override
        public boolean onCreate() {
            return true;
        }

        @Override
        public Bundle call(String method, String arg, Bundle extras) {
            if (!"sendBinder".equals(method) || extras == null) return null;
            extras.setClassLoader(Container.class.getClassLoader());
            Object c = extras.getParcelable(EXTRA_BINDER);
            if (c instanceof Container) received(((Container) c).binder, getContext().getPackageName());
            return new Bundle();
        }

        @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
        @Override public String getType(Uri u) { return null; }
        @Override public Uri insert(Uri u, ContentValues v) { return null; }
        @Override public int delete(Uri u, String s, String[] a) { return 0; }
        @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
    }
}
