package com.wave.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

/**
 * Wave's loading screen, in front of Tidal's page (and its logo) until the page has drawn. Drawn
 * by the app, so it's there from the first frame; it fades out and removes itself. Five styles
 * (a developer option), all from Wave's icon curve in Wave's blue on black:
 * 0 Drawn (the default), 1 Flowing, 2 Ripples, 3 Levels, 4 Sea.
 */
final class LoadingWaves extends View {
    static final int STYLES = 5, DEFAULT_STYLE = 0;
    private static final int BLUE = 0xFF33C3F0;
    /** Sea's waves: y offset, x offset, stroke width (icon units), opacity, seconds per cycle (negative: the other way). */
    private static final float[][] SEA = {
            {-9, 0, 3, 0.30f, 3.0f},
            {8, -12, 4, 0.55f, -1.5f},
            {0, 0, 6, 1.00f, 2.2f},
    };
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG), fade = new Paint();
    private final Path path = new Path(), part = new Path();
    private final long start = SystemClock.uptimeMillis();
    private final int style;
    private boolean leaving;

    LoadingWaves(Context c, int style) {
        super(c);
        this.style = style >= 0 && style < STYLES ? style : DEFAULT_STYLE;
        setBackgroundColor(Color.BLACK);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setColor(BLUE);
        fill.setColor(BLUE);
        fade.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_IN));
        setClickable(true); // nothing behind it is touched meanwhile
    }

    @Override
    protected void onDraw(Canvas canvas) {
        int w = getWidth(), h = getHeight();
        float t = (SystemClock.uptimeMillis() - start) / 1000f, side = Math.min(w, h);
        switch (style) {
            case 0: drawn(canvas, w, h, side * 0.46f / 60f, t); break;
            case 1: flowing(canvas, w, h, side * 0.50f / 60f, t, new float[][]{{0, 0, 6, 1f, 1.2f}}); break;
            case 2: ripples(canvas, w, h, side * 0.46f / 60f, t); break;
            case 3: levels(canvas, w, h, side * 0.46f / 60f, t); break;
            case 4: flowing(canvas, w, h, side * 0.56f / 60f, t, SEA); break;
            default: drawn(canvas, w, h, side * 0.46f / 60f, t); break;
        }
        if (getParent() != null) postInvalidateOnAnimation();
    }

    /** Wave's icon, centred: M30,56 C38,42 46,42 54,56 S70,70 78,56 (its middle is 54,56). */
    private void icon(Path p, float cx, float cy, float u) {
        p.reset();
        p.moveTo(cx - 24 * u, cy);
        p.cubicTo(cx - 16 * u, cy - 14 * u, cx - 8 * u, cy - 14 * u, cx, cy);
        p.cubicTo(cx + 8 * u, cy + 14 * u, cx + 16 * u, cy + 14 * u, cx + 24 * u, cy);
    }

    /** A: the icon draws itself left to right, holds, fades, and again (1.8 s). */
    private void drawn(Canvas c, int w, int h, float u, float t) {
        float k = (t % 1.8f) / 1.8f, drawn = Math.min(1f, k / 0.55f), alpha = k < 0.8f ? 1f : 1f - (k - 0.8f) / 0.2f;
        drawn = drawn * drawn * (3 - 2 * drawn); // ease in and out
        icon(path, w / 2f, h / 2f, u);
        PathMeasure pm = new PathMeasure(path, false);
        part.reset();
        pm.getSegment(0, pm.getLength() * drawn, part, true);
        line.setStrokeWidth(6 * u);
        line.setAlpha(Math.round(alpha * 255));
        c.drawPath(part, line);
    }

    /** B and E: waves of the icon's curve moving sideways, fading at the sides. */
    private void flowing(Canvas c, int w, int h, float u, float t, float[][] waves) {
        float boxW = 60 * u, left = (w - boxW) / 2f, cy = h / 2f;
        int layer = c.saveLayer(left, cy - 40 * u, left + boxW, cy + 40 * u, null);
        for (float[] wv : waves) {
            float cycle = Math.abs(wv[4]), phase = (t % cycle) / cycle * 48f; // 48 units: one full wave
            if (wv[4] < 0) phase = 48f - phase;
            line.setStrokeWidth(wv[2] * u);
            line.setAlpha(Math.round(wv[3] * 255));
            path.reset();
            float x0 = left + (wv[1] - phase - 24) * u, y = cy + wv[0] * u;
            path.moveTo(x0, y);
            for (int k = 0; k < 8; k++) {
                float x = x0 + k * 24 * u, up = (k % 2 == 0) ? -14 * u : 14 * u;
                path.cubicTo(x + 8 * u, y + up, x + 16 * u, y + up, x + 24 * u, y);
            }
            c.drawPath(path, line);
        }
        fade.setShader(new LinearGradient(left, 0, left + boxW, 0,
                new int[]{0x00000000, 0xFF000000, 0xFF000000, 0x00000000}, new float[]{0f, 0.25f, 0.75f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(left, cy - 40 * u, left + boxW, cy + 40 * u, fade);
        c.restoreToCount(layer);
    }

    /** C: the icon still, rings spreading from it (every 0.8 s, each 2.4 s). */
    private void ripples(Canvas c, int w, int h, float u, float t) {
        float cx = w / 2f, cy = h / 2f;
        line.setStrokeWidth(1.5f * u);
        for (int i = 0; i < 3; i++) {
            float k = ((t + i * 0.8f) % 2.4f) / 2.4f, eased = 1 - (1 - k) * (1 - k);
            line.setAlpha(Math.round(0.7f * (1 - eased) * 255));
            c.drawCircle(cx, cy, 26 * u * (0.4f + 1.2f * eased), line);
        }
        icon(path, cx, cy, u);
        line.setStrokeWidth(6 * u);
        line.setAlpha(255);
        c.drawPath(path, line);
    }

    /** D: nine level bars rising and falling in a wave across (1.1 s, each 0.09 s after the last). */
    private void levels(Canvas c, int w, int h, float u, float t) {
        float bw = 5.2f * u, gap = 4.3f * u, full = 52 * u, total = 9 * bw + 8 * gap, x = (w - total) / 2f, cy = h / 2f;
        for (int i = 0; i < 9; i++) {
            float k = ((t - i * 0.09f) % 1.1f + 1.1f) % 1.1f / 1.1f;
            float s = 0.2f + 0.8f * (0.5f - 0.5f * (float) Math.cos(2 * Math.PI * k)), bh = full * s;
            c.drawRoundRect(x, cy - bh / 2, x + bw, cy + bh / 2, bw / 2, bw / 2, fill);
            x += bw + gap;
        }
    }

    /** The page is up: fade out, then gone. */
    void leave() {
        if (leaving) return;
        leaving = true;
        animate().alpha(0f).setDuration(350).withEndAction(() -> {
            setVisibility(GONE);
            if (getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) getParent()).removeView(this);
        }).start();
    }
}
