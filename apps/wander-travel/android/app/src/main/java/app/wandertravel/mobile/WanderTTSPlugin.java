package app.wandertravel.mobile;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name = "WanderTTS")
public class WanderTTSPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private volatile boolean ready = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onDone(String utteranceId) {}
            @Override public void onError(String utteranceId) {}
        });
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (ready && tts != null) tts.setLanguage(Locale.forLanguageTag("es-AR"));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            call.reject("TTS_TEXT_REQUIRED");
            return;
        }
        if (!ready || tts == null) {
            call.reject("TTS_NOT_READY");
            return;
        }
        String language = call.getString("language", "es-AR");
        Double rate = call.getDouble("rate", 1.0);
        Double pitch = call.getDouble("pitch", 1.0);
        Boolean interrupt = call.getBoolean("interrupt", false);
        Locale locale = Locale.forLanguageTag(language == null ? "es-AR" : language);
        tts.setLanguage(locale);
        tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate == null ? 1.0f : rate.floatValue())));
        tts.setPitch(Math.max(0.5f, Math.min(2.0f, pitch == null ? 1.0f : pitch.floatValue())));
        String utteranceId = "wander-" + System.currentTimeMillis();
        int result = tts.speak(text.trim(), Boolean.TRUE.equals(interrupt) ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, utteranceId);
        if (result == TextToSpeech.ERROR) {
            call.reject("TTS_SPEAK_FAILED");
            return;
        }
        JSObject response = new JSObject();
        response.put("ok", true);
        response.put("utteranceId", utteranceId);
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        JSObject response = new JSObject();
        response.put("ok", true);
        call.resolve(response);
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject response = new JSObject();
        response.put("ready", ready);
        response.put("speaking", tts != null && tts.isSpeaking());
        call.resolve(response);
    }
}
