package com.hogarcompartido.app;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.util.Base64;
import android.provider.OpenableColumns;
import android.database.Cursor;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.json.JSONObject;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.content.ContentResolver;
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
  private static final int PICK_RECEIPT=7421, SAVE_EXPORT=7422, PICK_NATIVE_RECEIPT=7423;
  private ValueCallback<Uri[]> chooser;
  private boolean choosingBackup=false;
  private boolean choosingCamera=false;
  private boolean nativeCamera=false;
  private Uri pendingCameraUri=null;
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
        discardPendingCamera();
        chooser=callback;
        choosingBackup=false;
        choosingCamera=false;
        String[] types=params.getAcceptTypes();
        if(types!=null)for(String accept:types)if(accept!=null&&accept.toLowerCase(Locale.ROOT).contains("json"))choosingBackup=true;
        boolean wantsImage=false;
        if(types!=null)for(String accept:types)if(accept!=null&&accept.toLowerCase(Locale.ROOT).startsWith("image/"))wantsImage=true;
        choosingCamera=params.isCaptureEnabled()&&wantsImage&&!choosingBackup&&Build.VERSION.SDK_INT>=29;
        try {
          if(choosingCamera){
            ContentValues values=new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME,"comprobante_"+System.currentTimeMillis()+".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Hogar Compartido");
            values.put(MediaStore.Images.Media.IS_PENDING,1);
            pendingCameraUri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
            if(pendingCameraUri==null)throw new IOException("No se pudo crear el archivo temporal");
            Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT,pendingCameraUri);
            camera.setClipData(ClipData.newRawUri("Comprobante",pendingCameraUri));
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(camera,PICK_RECEIPT);
          }else{
            Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            picker.putExtra(Intent.EXTRA_MIME_TYPES,choosingBackup
              ?new String[]{"application/json","text/plain","application/octet-stream"}
              :new String[]{"application/pdf","image/jpeg","image/png","image/webp"});
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
            picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(picker,PICK_RECEIPT);
          }
        }catch(Exception ex){
          discardPendingCamera();chooser=null;choosingBackup=false;choosingCamera=false;
          callback.onReceiveValue(null);
          Toast.makeText(MainActivity.this,"No se pudo abrir "+(params.isCaptureEnabled()?"la cámara":"el selector de archivos"),Toast.LENGTH_LONG).show();
        }
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
    // The user invokes the native picker/camera directly; no web file-input tricks.
    @JavascriptInterface public void pickReceipt(String mode){
      runOnUiThread(()->{
        if(chooser!=null){Toast.makeText(MainActivity.this,"Cerrá el selector anterior",Toast.LENGTH_LONG).show();return;}
        if(pendingCameraUri!=null)discardPendingCamera();
        nativeCamera="camera".equals(mode);
        try{
          if(nativeCamera){
            if(Build.VERSION.SDK_INT<29)throw new IllegalStateException("Cámara no compatible");
            ContentValues values=new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME,"comprobante_"+System.currentTimeMillis()+".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Hogar Compartido");
            values.put(MediaStore.Images.Media.IS_PENDING,1);
            pendingCameraUri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
            if(pendingCameraUri==null)throw new IOException("No se pudo abrir almacenamiento");
            Intent intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT,pendingCameraUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent,PICK_NATIVE_RECEIPT);
          }else{
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","image/webp","application/pdf"});
            startActivityForResult(intent,PICK_NATIVE_RECEIPT);
          }
        }catch(Exception err){
          discardPendingCamera();
          runNativeCancelled();
          Toast.makeText(MainActivity.this,"No se pudo abrir "+(nativeCamera?"la cámara":"el explorador"),Toast.LENGTH_LONG).show();
        }
      });
    }
    @JavascriptInterface public void saveBase64(String filename,String mime,String encoded) {
      if(filename==null||mime==null||encoded==null||filename.length()>130||encoded.length()>15000000)return;
      String safe=filename.replaceAll("[^a-zA-Z0-9._ -]","_");
      boolean json=safe.endsWith(".json")&&mime.startsWith("application/json");
      boolean csv=safe.endsWith(".csv")&&mime.startsWith("text/csv");
      boolean pdf=safe.endsWith(".pdf")&&mime.startsWith("application/pdf");
      boolean zip=safe.endsWith(".zip")&&(mime.startsWith("application/zip")||mime.startsWith("application/x-zip-compressed"));
      if(!(json||csv||pdf||zip)||!safe.matches("(hogar-compartido-respaldo|informe-hogar|cuentas-hogar|finanzas-hogar)[a-zA-Z0-9._ -]*"))return;
      try {
        byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
        if(bytes.length<1||bytes.length>10*1024*1024)return;
        String type=json?"application/json":csv?"text/csv":pdf?"application/pdf":"application/zip";
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
  private void discardPendingCamera(){
    if(pendingCameraUri!=null){
      try{getContentResolver().delete(pendingCameraUri,null,null);}catch(Exception ignored){}
      pendingCameraUri=null;
    }
  }
  private void runNativeCancelled(){
    if(web!=null)web.evaluateJavascript("window.HogarNativeFiles?.cancel?.()",null);
  }
  private void handleNativeReceipt(Uri uri,boolean fromCamera){
    new Thread(()->{
      try{
        String mime=fromCamera?"image/jpeg":getContentResolver().getType(uri);
        if(mime==null)throw new IOException("Tipo de archivo desconocido");
        if(!mime.equals("application/pdf")&&!mime.equals("image/jpeg")&&!mime.equals("image/png")&&!mime.equals("image/webp"))
           throw new IOException("Solo se permiten PDF, JPG, PNG y WebP");
        String name=fromCamera?"comprobante.jpg":"comprobante";
        if(!fromCamera){
          try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);
          }catch(Exception ignored){}
        }
        if(name==null||name.isEmpty())name="comprobante";
        name=name.replaceAll("[\\r\\n]"," ").substring(0,Math.min(180,name.length()));
        ByteArrayOutputStream output=new ByteArrayOutputStream();
        try(InputStream stream=getContentResolver().openInputStream(uri)){
          if(stream==null)throw new IOException("No se pudo leer el archivo");
          byte[] buffer=new byte[8192];int length;
          while((length=stream.read(buffer))!=-1){
            if(output.size()+length>5242880)throw new IOException("Archivo de más de 5 MB");
            output.write(buffer,0,length);
          }
        }
        byte[] bytes=output.toByteArray();if(bytes.length==0)throw new IOException("Archivo vacío");
        String payload="window.HogarNativeFiles?.receiveFile?.("+JSONObject.quote(name)+","+JSONObject.quote(mime)+","+JSONObject.quote(Base64.encodeToString(bytes,Base64.NO_WRAP))+")";
        runOnUiThread(()->{if(web!=null)web.evaluateJavascript(payload,null);});
      }catch(Exception e){
        runOnUiThread(()->{runNativeCancelled();Toast.makeText(this,"No se pudo leer el comprobante: "+e.getMessage(),Toast.LENGTH_LONG).show();});
      }
    }).start();
  }
  @Override protected void onActivityResult(int code,int resultCode,Intent data) {
    if(code==PICK_NATIVE_RECEIPT){
      boolean fromCamera=nativeCamera;nativeCamera=false;
      Uri uri=resultCode==RESULT_OK?(fromCamera?pendingCameraUri:(data!=null?data.getData():null)):null;
      if(uri!=null&&"content".equalsIgnoreCase(uri.getScheme())){
        if(fromCamera){
          try{ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.IS_PENDING,0);getContentResolver().update(uri,values,null,null);}catch(Exception ignored){}
          pendingCameraUri=null;
        }
        handleNativeReceipt(uri,fromCamera);
      }else{if(fromCamera)discardPendingCamera();runNativeCancelled();}
      return;
    }
    super.onActivityResult(code,resultCode,data);
    if(code==PICK_RECEIPT){
      ValueCallback<Uri[]> callback=chooser;chooser=null;
      boolean camera=choosingCamera,backup=choosingBackup;
      choosingCamera=false;choosingBackup=false;
      if(callback!=null){
        Uri[] selected=null;
        if(resultCode==RESULT_OK){
          if(camera&&pendingCameraUri!=null){
            Uri photo=pendingCameraUri;
            try{
              ContentValues done=new ContentValues();
              done.put(MediaStore.Images.Media.IS_PENDING,0);
              getContentResolver().update(photo,done,null,null);
              selected=new Uri[]{photo};pendingCameraUri=null;
            }catch(Exception err){discardPendingCamera();Toast.makeText(this,"No se pudo finalizar la foto",Toast.LENGTH_LONG).show();}
          }else if(data!=null){
            java.util.ArrayList<Uri> items=new java.util.ArrayList<>();
            if(data.getClipData()!=null){
              ClipData clip=data.getClipData();
              for(int i=0;i<Math.min(clip.getItemCount(),10);i++)items.add(clip.getItemAt(i).getUri());
              if(clip.getItemCount()>10){
                items.clear();
                Toast.makeText(this,"Podés seleccionar hasta 10 archivos por vez",Toast.LENGTH_LONG).show();
              }
            }else if(data.getData()!=null)items.add(data.getData());
            java.util.ArrayList<Uri> valid=new java.util.ArrayList<>();
            boolean denied=false;
            for(Uri uri:items){
              if(uri==null||!"content".equalsIgnoreCase(uri.getScheme())){denied=true;break;}
              String type=getContentResolver().getType(uri);
              boolean allowed=backup?("application/json".equals(type)||"text/plain".equals(type)||"application/octet-stream".equals(type)):
                ("application/pdf".equals(type)||"image/jpeg".equals(type)||"image/png".equals(type)||"image/webp".equals(type));
              if(!allowed){denied=true;break;}
              valid.add(uri);
            }
            if(denied){Toast.makeText(this,"Seleccioná PDF o imágenes JPG, PNG y WebP",Toast.LENGTH_LONG).show();}
            else if(!valid.isEmpty())selected=valid.toArray(new Uri[0]);
          }
        }
        if(camera&&selected==null)discardPendingCamera();
        callback.onReceiveValue(selected);
      }else if(camera)discardPendingCamera();
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
  @Override public void onDestroy(){if(chooser!=null){chooser.onReceiveValue(null);chooser=null;}discardPendingCamera();choosingBackup=false;choosingCamera=false;nativeCamera=false;pendingExport=null;if(web!=null)web.destroy();super.onDestroy();}
}