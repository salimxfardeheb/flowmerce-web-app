package com.flowmerce.app;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    try {
      WebView webView = getBridge().getWebView();
      ViewGroup parent = (ViewGroup) webView.getParent();

      if (parent != null && !(parent instanceof SwipeRefreshLayout)) {
        int index = parent.indexOfChild(webView);
        parent.removeViewAt(index);

        SwipeRefreshLayout swipeRefresh = new SwipeRefreshLayout(this);
        swipeRefresh.setLayoutParams(new ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        ));
        swipeRefresh.setColorSchemeColors(0xFF3B82F6, 0xFF06B6D4);

        swipeRefresh.addView(webView);
        parent.addView(swipeRefresh, index);

        swipeRefresh.setOnRefreshListener(() -> webView.reload());

        webView.setWebViewClient(new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            swipeRefresh.setRefreshing(false);
          }

          @Override
          public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            swipeRefresh.setRefreshing(false);
            view.loadUrl("file:///android_asset/offline.html");
          }
        });
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  // ← AJOUT : bouton retour Android
  @Override
  public void onBackPressed() {
    WebView webView = getBridge().getWebView();
    if (webView.canGoBack()) {
      webView.goBack();
    } else {
      super.onBackPressed();
    }
  }
}