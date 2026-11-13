package com.iadb.api;

import android.os.IBinder;
import android.os.Parcel;
import android.os.Parcelable;

/**
 * iAdb hands its connection over wrapped in this, by this exact class name (see IadbGrant). Same
 * shape as iAdb's own (FileContainer/iAdb-api, MIT licence): just the binder.
 */
public class Container implements Parcelable {
    public final IBinder binder;

    public Container(IBinder binder) {
        this.binder = binder;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeStrongBinder(binder);
    }

    public static final Creator<Container> CREATOR = new Creator<Container>() {
        @Override
        public Container createFromParcel(Parcel in) {
            return new Container(in.readStrongBinder());
        }

        @Override
        public Container[] newArray(int size) {
            return new Container[size];
        }
    };
}
