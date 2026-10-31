package com.hogarcompartido.app;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.content.ClipData;
import android.widget.Toast;
import java.io.OutputStream;
import java.util.Locale;
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
  private static final int PICK_RECEIPT=7421, SAVE_EXPORT=7422;
  private ValueCallback<Uri[]> chooser;
  private byte[] pendingExport;
  private String pendingExportName;
  private String pendingExportMime;
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
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);
    s.setJavaScriptCanOpenWindowsAutomatically(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptCookie(true);
    web.addJavascriptInterface(new ReminderSupport.Bridge(this),"AndroidReminders");
    web.addJavascriptInterface(new DocumentBridge(),"AndroidFiles");
    ReminderSupport.setupChannel(this);
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(chooser!=null){chooser.onReceiveValue(null);chooser=null;}
        chooser=callback;
        try{
          Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
          picker.addCategory(Intent.CATEGORY_OPENABLE);
          picker.setType("*/*");
          picker.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/jpeg","image/png","image/webp"});
          startActivityForResult(picker,PICK_RECEIPT);
        }catch(Exception ex){chooser=null;callback.onReceiveValue(null);Toast.makeText(MainActivity.this,"No se pudo abrir el selector de comprobantes",Toast.LENGTH_LONG).show();}
        return true;
      }
    });
    web.setDownloadListener((url,agent,disposition,mime,length)->{
      if(url==null||!url.startsWith("https://"))return;
      try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ex){Toast.makeText(this,"No se pudo abrir la descarga externa",Toast.LENGTH_LONG).show();}
    });
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

  // A very narrow bridge: only local user-approved JSON, CSV and PDF saves.
  public final class DocumentBridge {
    @JavascriptInterface public void saveBase64(String filename,String mime,String encoded) {
      if(filename==null||mime==null||encoded==null||filename.length()>130||encoded.length()>15000000)return;
      String safe=filename.replaceAll("[^a-zA-Z0-9._ -]","_");
      boolean json=safe.endsWith(".json")&&mime.startsWith("application/json");
      boolean csv=safe.endsWith(".csv")&&mime.startsWith("text/csv");
      boolean pdf=safe.endsWith(".pdf")&&mime.startsWith("application/pdf");
      if(!(json||csv||pdf)||!safe.matches("(hogar-compartido-respaldo|informe-hogar|cuentas-hogar|finanzas-hogar)[a-zA-Z0-9._ -]*"))return;
      try {
        byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
        if(bytes.length<1||bytes.length>10*1024*1024)return;
        String type=json?"application/json":csv?"text/csv":"application/pdf";
        runOnUiThread(()->{
          if(pendingExport!=null){Toast.makeText(MainActivity.this,"Terminá de guardar el archivo anterior",Toast.LENGTH_LONG).show();return;}
          pendingExport=bytes;pendingExportName=safe;pendingExportMime=type;
          try {
            Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
            save.addCategory(Intent.CATEGORY_OPENABLE);
            save.setType(type);
            save.putExtra(Intent.EXTRA_TITLE,safe);
            startActivityForResult(save,SAVE_EXPORT);
          }catch(Exception e){
            pendingExport=null;pendingExportName=null;pendingExportMime=null;
            Toast.makeText(MainActivity.this,"No se pudo abrir el guardado de archivos",Toast.LENGTH_LONG).show();
          }
        });
      }catch(Exception ignored){}
    }
  }
  @Override protected void onActivityResult(int code,int resultCode,Intent data) {
    super.onActivityResult(code,resultCode,data);
    if(code==PICK_RECEIPT){
      ValueCallback<Uri[]> callback=chooser;chooser=null;
      if(callback!=null){
        Uri uri=(resultCode==RESULT_OK&&data!=null)?data.getData():null;
        if(uri!=null&&"content".equalsIgnoreCase(uri.getScheme())){
          String type=getContentResolver().getType(uri);
          if(!"application/pdf".equals(type)&&!"image/jpeg".equals(type)&&!"image/png".equals(type)&&!"image/webp".equals(type)){
            Toast.makeText(this,"Elegí un PDF o una imagen JPG, PNG o WebP",Toast.LENGTH_LONG).show();
            callback.onReceiveValue(null);
          }else callback.onReceiveValue(new Uri[]{uri});
        }else callback.onReceiveValue(null);
      }
      return;
    }
    if(code==SAVE_EXPORT){
      byte[] bytes=pendingExport;pendingExport=null;pendingExportName=null;pendingExportMime=null;
      if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null&&bytes!=null){
        Uri uri=data.getData();
        // Storage Access Framework URI is selected by the user. No filesystem permission.
        new Thread(()->{
          try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){
            if(out==null)throw new Exception("No se pudo escribir");
            out.write(bytes);out.flush();
            runOnUiThread(()->Toast.makeText(this,"Archivo guardado correctamente",Toast.LENGTH_LONG).show());
          }catch(Exception e){runOnUiThread(()->Toast.makeText(this,"No se pudo guardar el archivo. Elegí otra ubicación.",Toast.LENGTH_LONG).show());}
        }).start();
      }
    }
  }
  @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override public void onDestroy(){if(chooser!=null){chooser.onReceiveValue(null);chooser=null;}pendingExport=null;if(web!=null)web.destroy();super.onDestroy();}
}