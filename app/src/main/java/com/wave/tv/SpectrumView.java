package com.wave.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.media.audiofx.Visualizer;
import android.os.SystemClock;
import android.view.View;

import java.util.HashSet;
import java.util.Set;

/**
 * Spectrum analyzer of what the TV is playing, in the cover's strongest colour. Two are used: one
 * over the bottom of the cover in Tidal's full-screen player (30% opaque, frequency labels just
 * under the cover) and a small solid one in the player bar.
 *
 * Tidal's streams are DRM-protected, so the page can't read them; Android's Visualizer measures
 * the decoded output instead (it needs the microphone permission; nothing is recorded). One
 * Visualizer is shared by every analyzer on screen and released when none is. Its built-in FFT is
 * split into bars spaced on a log scale from the lowest frequency it measures (~47 Hz) to 20 kHz, in dB. Bars rise at once and fall
 * smoothly, with a peak marker that holds briefly.
 */
final class SpectrumView extends View {
    private static final float HIGH_HZ = 20000, FLOOR_DB = -50;
    private static final float FALL_DB_PER_S = 45, PEAK_FALL_DB_PER_S = 25;
    private static final long PEAK_HOLD_MS = 400;
    private static final float[] LABEL_HZ = {50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000};
    private static final String[] LABELS = {"50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"};
    static final int DEFAULT_COLOR = 0xFF33C3F0;

    // ---- The shared capture ----
    private static Visualizer visualizer;
    private static final Set<SpectrumView> running = new HashSet<>();
    private static byte[] fft;
    private static int fftRateMilliHz;
    private static long fftVersion;
    /**
     * The scale's low end: the lowest frequency Android's capture measures (its first FFT bin,
     * ~47 Hz at 48 kHz output, ~43 Hz at 44.1 kHz). Nothing below it is measured, so the bars and
     * labels start there.
     */
    private static float lowHz = 48000f / 1024;

    private static final Visualizer.OnDataCaptureListener CAPTURE = new Visualizer.OnDataCaptureListener() {
        @Override
        public void onWaveFormDataCapture(Visualizer v, byte[] wave, int rate) {
        }

        /** fft: [DC, Nyquist, re1, im1, re2, im2, ...]; rate in mHz. Arrives on the main thread. */
        @Override
        public void onFftDataCapture(Visualizer v, byte[] data, int rate) {
            if (fft == null || fft.length != data.length) fft = new byte[data.length];
            System.arraycopy(data, 0, fft, 0, data.length);
            fftRateMilliHz = rate;
            if (rate > 0) lowHz = rate / 1000f / data.length;
            fftVersion++;
        }
    };

    // ---- This analyzer ----
    private final int bars;
    private final boolean labels;
    private final float barAlpha, peakAlpha;
    private final float[] target, shown, peak;
    private final long[] peakAt;
    private final Paint barPaint = new Paint(), peakPaint = new Paint(), labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;
    private long lastFrame, seenVersion = -1;
    private int color = DEFAULT_COLOR;
    private android.animation.ValueAnimator fade;

    /**
     * @param bars     number of bars
     * @param labels   frequency labels in a row under the bars
     * @param barAlpha opacity of the bars (0..1)
     */
    SpectrumView(Context ctx, int bars, boolean labels, float barAlpha) {
        super(ctx);
        this.bars = bars;
        this.labels = labels;
        this.barAlpha = barAlpha;
        this.peakAlpha = Math.min(1f, barAlpha + 0.1f);
        target = new float[bars];
        shown = new float[bars];
        peak = new float[bars];
        peakAt = new long[bars];
        density = ctx.getResources().getDisplayMetrics().density;
        applyColor(DEFAULT_COLOR);
        labelPaint.setColor(0xB3FFFFFF);
        labelPaint.setTextSize(10 * ctx.getResources().getDisplayMetrics().scaledDensity);
        labelPaint.setTextAlign(Paint.Align.CENTER);
        reset();
    }

    /** Height of the label row under the bars, in px (0 without labels). */
    int labelHeight() {
        return labels ? Math.round(labelPaint.getTextSize() + 4 * density) : 0;
    }

    /** Fades the bars to a new colour (the cover's strongest). */
    void setColor(int rgb) {
        if (rgb == color) return;
        if (fade != null) fade.cancel();
        fade = android.animation.ValueAnimator.ofArgb(color, rgb);
        fade.setDuration(400);
        fade.addUpdateListener(a -> applyColor((Integer) a.getAnimatedValue()));
        fade.start();
        color = rgb;
    }

    private void applyColor(int rgb) {
        barPaint.setColor((Math.round(barAlpha * 255) << 24) | (rgb & 0xFFFFFF));
        // Peak markers: the same colour lightened towards white, a little stronger than the bars.
        int r = (((rgb >> 16) & 0xFF) + 255) / 2, g = (((rgb >> 8) & 0xFF) + 255) / 2, b = ((rgb & 0xFF) + 255) / 2;
        peakPaint.setColor((Math.round(peakAlpha * 255) << 24) | (r << 16) | (g << 8) | b);
        invalidate();
    }

    /** The cover's strongest colour: the hue that's most vivid and widespread, made bright enough to show. */
    static int strongestColor(android.graphics.Bitmap cover) {
        android.graphics.Bitmap s = android.graphics.Bitmap.createScaledBitmap(cover, 32, 32, true);
        float[] weight = new float[24], hsv = new float[3];
        float[][] sum = new float[24][3];
        for (int y = 0; y < 32; y++) {
            for (int x = 0; x < 32; x++) {
                int c = s.getPixel(x, y);
                android.graphics.Color.colorToHSV(c, hsv);
                if (hsv[1] < 0.25f || hsv[2] < 0.2f) continue; // greys, near-black
                float w = hsv[1] * hsv[1] * hsv[2]; // favours vivid colours
                int bin = ((int) (hsv[0] / 15)) % 24;
                weight[bin] += w;
                sum[bin][0] += ((c >> 16) & 0xFF) * w;
                sum[bin][1] += ((c >> 8) & 0xFF) * w;
                sum[bin][2] += (c & 0xFF) * w;
            }
        }
        int best = 0;
        for (int i = 1; i < 24; i++) if (weight[i] > weight[best]) best = i;
        if (weight[best] < 8) return DEFAULT_COLOR; // hardly any colour (black and white covers)
        float w = weight[best];
        int c = android.graphics.Color.rgb(Math.round(sum[best][0] / w), Math.round(sum[best][1] / w), Math.round(sum[best][2] / w));
        android.graphics.Color.colorToHSV(c, hsv);
        hsv[1] = Math.max(hsv[1], 0.6f);
        hsv[2] = Math.max(hsv[2], 0.9f);
        return android.graphics.Color.HSVToColor(hsv);
    }

    private void reset() {
        java.util.Arrays.fill(target, FLOOR_DB);
        java.util.Arrays.fill(shown, FLOOR_DB);
        java.util.Arrays.fill(peak, FLOOR_DB);
    }

    /** Starts this analyzer (the microphone permission must already be granted). */
    void start() {
        if (!running.add(this)) return;
        if (visualizer == null) {
            try {
                Visualizer v = new Visualizer(0); // the TV's output mix
                v.setEnabled(false);
                v.setCaptureSize(Math.min(1024, Visualizer.getCaptureSizeRange()[1]));
                v.setDataCaptureListener(CAPTURE, Visualizer.getMaxCaptureRate(), false, true);
                v.setEnabled(true);
                visualizer = v;
            } catch (RuntimeException e) {
                visualizer = null; // not available on this TV: the bars just stay down
            }
        }
        lastFrame = 0;
        postInvalidateOnAnimation();
    }

    void stop() {
        if (running.remove(this) && running.isEmpty() && visualizer != null) {
            try {
                visualizer.setEnabled(false);
            } catch (RuntimeException ignored) {
                // Released anyway.
            }
            visualizer.release();
            visualizer = null;
            fft = null;
        }
        reset();
    }

    /** This analyzer's bars from the latest capture. */
    private void measure() {
        byte[] f = fft;
        if (f == null || seenVersion == fftVersion) return;
        seenVersion = fftVersion;
        int bins = f.length / 2; // bins 1 .. bins-1 have re/im
        float binHz = fftRateMilliHz / 1000f / f.length;
        if (binHz <= 0) return;
        double low = binHz, ratio = HIGH_HZ / low;
        for (int b = 0; b < bars; b++) {
            double lo = low * Math.pow(ratio, (double) b / bars);
            double hi = low * Math.pow(ratio, (double) (b + 1) / bars);
            int k0 = Math.max(1, (int) Math.ceil(lo / binHz)), k1 = Math.min(bins - 1, (int) Math.floor(hi / binHz));
            double power = 0;
            if (k1 >= k0) {
                for (int k = k0; k <= k1; k++) power += power(f, k); // the bins inside the bar
            } else {
                // Narrower than a bin (the low end): the level at the bar's centre, between the two
                // nearest bins, so neighbouring bass bars don't all show the same bin.
                double c = Math.max(1, Math.min(bins - 1, Math.sqrt(lo * hi) / binHz));
                int k = (int) Math.floor(c);
                double t = c - k;
                power = k + 1 < bins ? (1 - t) * power(f, k) + t * power(f, k + 1) : power(f, k);
            }
            float db = (float) (10 * Math.log10(power / (128.0 * 128.0) + 1e-9));
            target[b] = Math.max(FLOOR_DB, Math.min(0, db));
        }
    }

    private static double power(byte[] f, int k) {
        float re = f[2 * k], im = f[2 * k + 1];
        return re * re + im * im;
    }

    @Override
    protected void onDraw(Canvas c) {
        measure();
        long now = SystemClock.uptimeMillis();
        float dt = lastFrame == 0 ? 0 : Math.min(0.1f, (now - lastFrame) / 1000f);
        lastFrame = now;

        float w = getWidth(), h = getHeight();
        float barsH = h - labelHeight(), slot = w / bars, gap = Math.max(1, slot * 0.2f), cap = 2 * density;
        for (int b = 0; b < bars; b++) {
            shown[b] = target[b] >= shown[b] ? target[b] : Math.max(target[b], shown[b] - FALL_DB_PER_S * dt);
            if (shown[b] >= peak[b]) {
                peak[b] = shown[b];
                peakAt[b] = now;
            } else if (now - peakAt[b] > PEAK_HOLD_MS) {
                peak[b] = Math.max(shown[b], peak[b] - PEAK_FALL_DB_PER_S * dt);
            }
            float x = b * slot + gap / 2, x2 = (b + 1) * slot - gap / 2;
            float level = (shown[b] - FLOOR_DB) / -FLOOR_DB, peakLevel = (peak[b] - FLOOR_DB) / -FLOOR_DB;
            c.drawRect(x, barsH - Math.max(cap, level * (barsH - cap * 2)), x2, barsH, barPaint);
            float py = barsH - cap * 2 - peakLevel * (barsH - cap * 2);
            c.drawRect(x, py, x2, py + cap, peakPaint);
        }
        if (labels) {
            // Each label where its frequency really is on the scale (lowHz .. 20 kHz).
            float ty = h - 3 * density, logRange = (float) Math.log(HIGH_HZ / lowHz);
            for (int i = 0; i < LABEL_HZ.length; i++) {
                if (LABEL_HZ[i] < lowHz) continue;
                float half = labelPaint.measureText(LABELS[i]) / 2;
                float x = w * (float) Math.log(LABEL_HZ[i] / lowHz) / logRange;
                c.drawText(LABELS[i], Math.max(half, Math.min(w - half, x)), ty, labelPaint);
            }
        }
        if (running.contains(this)) postInvalidateOnAnimation();
    }
}
