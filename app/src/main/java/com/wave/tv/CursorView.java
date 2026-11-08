package com.wave.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Draws the on-screen pointer that the D-pad moves. Purely visual; it never takes focus or touches. */
final class CursorView extends View {
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path arrow = new Path();
    private float x, y;

    CursorView(Context ctx) {
        super(ctx);
        float d = ctx.getResources().getDisplayMetrics().density;
        fill.setColor(0xFFFFFFFF);
        stroke.setColor(0xFF000000);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(1.5f * d);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        // Classic arrow pointer, tip at (0,0), ~22dp tall.
        float s = d;
        arrow.moveTo(0, 0);
        arrow.lineTo(0, 22 * s);
        arrow.lineTo(6 * s, 16.5f * s);
        arrow.lineTo(10 * s, 25 * s);
        arrow.lineTo(13.5f * s, 23.5f * s);
        arrow.lineTo(9.5f * s, 15 * s);
        arrow.lineTo(16.5f * s, 15 * s);
        arrow.close();
        setFocusable(false);
        setClickable(false);
    }

    void moveTo(float nx, float ny) {
        x = nx;
        y = ny;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        c.save();
        c.translate(x, y);
        c.drawPath(arrow, fill);
        c.drawPath(arrow, stroke);
        c.restore();
    }
}
