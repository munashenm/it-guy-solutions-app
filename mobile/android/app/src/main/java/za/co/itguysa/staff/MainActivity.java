package za.co.itguysa.staff;

import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_ID = "itguy_jobs";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createJobChannel();
        if (bridge == null || bridge.getWebView() == null) return;

        WebView webView = bridge.getWebView();
        webView.setWebViewClient(new StaffWebViewClient(bridge, this));
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) request.addRequestHeader("Cookie", cookie);
            String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
            request.setTitle(filename);
            request.setDescription("IT Guy Staff");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager != null) {
                manager.enqueue(request);
                Toast.makeText(this, "Downloading " + filename, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void createJobChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Job updates",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Assignments and job status changes");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    void injectShell(WebView webView) {
        try {
            String script = readAsset("public/staff-shell.js") + "\n" + readAsset("public/native-shell.js");
            webView.evaluateJavascript(script, null);
        } catch (Exception ignored) {
            // The live page also loads these scripts after the web app is deployed.
        }
    }

    private String readAsset(String name) throws Exception {
        try (InputStream in = getAssets().open(name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    static final class StaffWebViewClient extends BridgeWebViewClient {
        private final MainActivity activity;

        StaffWebViewClient(Bridge bridge, MainActivity activity) {
            super(bridge);
            this.activity = activity;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String url = uri.toString();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            boolean externalScheme = scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("sms") || scheme.equals("whatsapp");
            boolean whatsApp = url.contains("wa.me") || url.contains("api.whatsapp.com") || url.contains("whatsapp.com/send");
            boolean pdf = url.matches("(?i).*\\.pdf([?#].*)?");
            if (externalScheme || whatsApp || pdf) {
                openExternal(uri, whatsApp || scheme.equals("whatsapp"));
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url != null && url.contains("app.itguysa.co.za")) {
                activity.injectShell(view);
            }
        }

        private void openExternal(Uri uri, boolean preferWhatsApp) {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            if (preferWhatsApp) intent.setPackage("com.whatsapp");
            try {
                activity.startActivity(intent);
            } catch (Exception first) {
                if (!preferWhatsApp) return;
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(activity, "No app is installed to open that link.", Toast.LENGTH_SHORT).show();
                }
            }
        }
    }
}
