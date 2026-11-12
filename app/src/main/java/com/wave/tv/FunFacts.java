package com.wave.tv;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fun facts for the song that's playing, from Wikipedia (switched on in the Wave tab; off to
 * start, since it sends the song's title and artist to Wikipedia). The song's own article first,
 * else the artist's; one sentence that says something about it (a chart, a sample, a record, how it
 * was made) rather than the article's opening "X is a song by Y". Nothing found: no fact.
 * Done on a background thread; answers are kept for songs played again.
 */
final class FunFacts {
    interface Result {
        /** text and the article it came from; both null when there's nothing worth showing. */
        void fact(String text, String article);
    }

    private static final String API = "https://en.wikipedia.org/w/api.php";
    private static final String SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
    // Wikipedia asks API users to say who they are (an app name and where to find it; no user data).
    private static final String AGENT = "Wave/1 (Android; https://github.com/Trevor792221/Wave)";
    private static final Map<String, String[]> cache = new LinkedHashMap<String, String[]>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String[]> e) {
            return size() > 100;
        }
    };
    /** Words that make a sentence a fact worth showing. */
    private static final Pattern GOOD = Pattern.compile(
            "\\b(chart|charts|charted|number one|No\\. ?1|peaked|debuted|top ten|top 10|billboard|hot 100|"
                    + "grammy|award|awards|nominated|won|certified|platinum|gold|diamond|million|billion|streams|"
                    + "sampl\\w*|interpolat\\w*|cover\\w*|recorded|written|wrote|co-wrote|produced|inspired|"
                    + "dedicated|named after|originally|first|only|record|viral|tiktok|soundtrack|film|"
                    + "video|music video|live|tour|banned|remix\\w*|re-recorded|cited|ranked|rolling stone)\\b",
            Pattern.CASE_INSENSITIVE);

    static void find(String title, String artist, Result r) {
        String song = cleanTitle(title), who = firstArtist(artist), key = (song + "|" + who).toLowerCase(Locale.ROOT);
        if (song.isEmpty()) {
            r.fact(null, null);
            return;
        }
        synchronized (cache) {
            String[] got = cache.get(key);
            if (got != null) {
                r.fact(got[0], got[1]);
                return;
            }
        }
        new Thread(() -> {
            String[] out = {null, null};
            try {
                String page = songArticle(song, who);
                String fact = page == null ? null : interesting(summary(page), false);
                if (fact == null && !who.isEmpty()) { // the artist instead
                    String ap = artistArticle(who);
                    if (ap != null) {
                        fact = interesting(summary(ap), true);
                        page = ap;
                    }
                }
                if (fact != null) {
                    out[0] = fact;
                    out[1] = page;
                }
                synchronized (cache) {
                    cache.put(key, out);
                }
            } catch (Exception ignored) {
                // No connection or no answer: no fact this time (tried again next time it plays).
            }
            r.fact(out[0], out[1]);
        }).start();
    }

    /** The title without "(feat. ...)", "(w/ ...)", "(from ...)", " - Remastered 2011" and the like. */
    static String cleanTitle(String t) {
        if (t == null) return "";
        String s = t.replaceAll("\\s*[\\(\\[](feat\\.?|ft\\.?|with|w/|from|prod\\.?|remaster\\w*|\\d{4} remaster\\w*|live|mono|stereo|bonus)[^\\)\\]]*[\\)\\]]", "");
        s = s.replaceAll("\\s+-\\s+(\\d{4} )?(remaster\\w*|live|mono|stereo|single version|radio edit|edit)\\b.*$", "");
        return s.trim();
    }

    static String firstArtist(String a) {
        if (a == null) return "";
        return a.split(",|&| feat\\.? | x ")[0].trim();
    }

    private static String norm(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    /** The song's article: a search hit whose name is the song's (perhaps "(song)" or "(Artist song)"). */
    private static String songArticle(String song, String artist) throws Exception {
        JSONArray hits = search("\"" + song + "\" " + artist + " song");
        String want = norm(song), by = norm(artist);
        for (int i = 0; i < hits.length(); i++) {
            JSONObject h = hits.getJSONObject(i);
            String name = h.optString("title"), base = norm(name.replaceAll("\\s*\\([^)]*\\)$", ""));
            String snippet = norm(h.optString("snippet").replaceAll("<[^>]+>", ""));
            boolean named = base.equals(want);
            boolean theirs = by.isEmpty() || norm(name).contains(by) || snippet.contains(by);
            boolean aSong = name.matches(".*\\((.* )?(song|single)\\)$") || snippet.contains("song") || snippet.contains("single");
            if (named && theirs && aSong) return name;
        }
        return null;
    }

    private static String artistArticle(String artist) throws Exception {
        JSONArray hits = search(artist + " musician singer band");
        String want = norm(artist);
        for (int i = 0; i < hits.length(); i++) {
            String name = hits.getJSONObject(i).optString("title");
            if (norm(name.replaceAll("\\s*\\([^)]*\\)$", "")).equals(want)) return name;
        }
        return null;
    }

    private static JSONArray search(String q) throws Exception {
        String url = API + "?action=query&list=search&format=json&srlimit=6&srsearch=" + URLEncoder.encode(q, "UTF-8");
        return new JSONObject(get(url)).getJSONObject("query").getJSONArray("search");
    }

    private static String summary(String page) throws Exception {
        String url = SUMMARY + URLEncoder.encode(page.replace(' ', '_'), "UTF-8").replace("+", "%20");
        return new JSONObject(get(url)).optString("extract", "");
    }

    /**
     * One sentence from the article's summary with something to it (see GOOD), not its opening
     * sentence (the plain "X is a song by Y"). Short enough for a card. null: nothing worth it.
     */
    static String interesting(String extract, boolean artist) {
        if (extract == null || extract.isEmpty()) return null;
        // Sentences: ends at ". ", "! " or "? " (not after initials or "No.", "St." and the like).
        String[] parts = extract.replaceAll("\\s+", " ").split("(?<=[.!?])(?<!\\b[A-Z]\\.)(?<!\\bNo\\.)(?<!\\bSt\\.)(?<!\\bvs\\.)(?<!\\bJr\\.)(?<!\\bMr\\.)\\s+(?=[A-Z\"“(])");
        String best = null;
        int bestScore = 0;
        for (int i = 1; i < parts.length; i++) { // not the opening sentence
            String p = parts[i].trim();
            if (p.length() < 40 || p.length() > 260) continue;
            Matcher m = GOOD.matcher(p);
            int score = 0;
            while (m.find()) score++;
            if (score > bestScore) {
                best = p;
                bestScore = score;
            }
        }
        if (best == null && !artist && parts.length > 1 && parts[1].length() >= 40 && parts[1].length() <= 260) best = parts[1].trim();
        return best;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(8000);
        con.setReadTimeout(10000);
        con.setRequestProperty("User-Agent", AGENT);
        con.setRequestProperty("Accept", "application/json");
        try {
            if (con.getResponseCode() != 200) throw new java.io.IOException("HTTP " + con.getResponseCode());
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } finally {
            con.disconnect();
        }
    }
}
