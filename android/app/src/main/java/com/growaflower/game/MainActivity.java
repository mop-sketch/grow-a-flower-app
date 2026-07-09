package com.growaflower.game;

import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Expose the native build flag to JavaScript so debug.js can auto-enable the
        // testing panel on debug builds and never on the Play (release) build. The
        // interface is registered synchronously here, before the WebView runs any page
        // script, so it's ready by the time debug.js checks it.
        getBridge().getWebView().addJavascriptInterface(new BuildInfo(), "AndroidBuildInfo");
    }

    /** Tiny bridge object: lets the web layer ask whether this is a debug build. */
    public static class BuildInfo {
        @JavascriptInterface
        public boolean isDebug() {
            return BuildConfig.DEBUG;
        }
    }
}
