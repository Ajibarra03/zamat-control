package com.hogarcompartido.app;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.Gravity;
import android.view.WindowInsets;
import android.webkit.*;
import android.net.http.SslError;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Button;
import android.widget.TextView;
import android.widget.LinearLayout;
public class MainActivity extends Activity {
  final String HOME="https://hogar-compartido-tripers.vercel.app/";
  final int BG=Color.rgb(13,22,38);
  WebView web; ProgressBar loading; LinearLayout error; boolean failed=false;
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    getWindow().setStatusBarColor(Color.rgb(16,27,45)); getWindow().setNavigationBarColor(BG);
    FrameLayout root=new FrameLayout(this); root.setBackgroundColor(BG);
    if(Build.VERSION.SDK_INT>=30)root.setOnApplyWindowInsetsListener((v,insets)->{
      android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
      v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
    });
    setContentView(root);
    web=new WebView(this);web.setBackgroundColor(BG);web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(false);
    s.setJavaScriptCanOpenWindowsAutomatically(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptCookie(true);
    web.setWebChromeClient(new WebChromeClient());
    loading=new ProgressBar(this);
    root.addView(loading,new FrameLayout.LayoutParams(120,120,Gravity.CENTER));
    error=new LinearLayout(this);error.setOrientation(LinearLayout.VERTICAL);error.setGravity(Gravity.CENTER);error.setPadding(32,32,32,32);error.setBackgroundColor(BG);
    TextView msg=new TextView(this);msg.setText("No se pudo conectar a Hogar Compartido.\nComprobá tu conexión a internet.");msg.setTextColor(Color.WHITE);msg.setTextSize(18);msg.setGravity(Gravity.CENTER);error.addView(msg);
    Button retry=new Button(this);retry.setText("Reintentar");retry.setAllCaps(false);retry.setOnClickListener(v->web.loadUrl(HOME));error.addView(retry);
    root.addView(error,new FrameLayout.LayoutParams(-1,-1));error.setVisibility(View.GONE);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri url=req.getUrl();
        if("https".equalsIgnoreCase(url.getScheme()) && "hogar-compartido-tripers.vercel.app".equalsIgnoreCase(url.getHost()))return false;
        try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}
        return true;
      }
      @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap icon){failed=false;error.setVisibility(View.GONE);loading.setVisibility(View.VISIBLE);}
      @Override public void onPageFinished(WebView v,String u){loading.setVisibility(View.GONE);if(failed)error.setVisibility(View.VISIBLE);}
      @Override public void onReceivedError(WebView v,WebResourceRequest req,WebResourceError e){if(req.isForMainFrame()){failed=true;loading.setVisibility(View.GONE);error.setVisibility(View.VISIBLE);}}
      @Override public void onReceivedSslError(WebView v,SslErrorHandler h,SslError e){h.cancel();failed=true;loading.setVisibility(View.GONE);error.setVisibility(View.VISIBLE);}
    });
    web.loadUrl(HOME);
  }
  @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override public void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}