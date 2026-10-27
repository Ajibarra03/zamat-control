package com.hogarcompartido.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

public final class ReminderSupport {
 private static final String CHANNEL="hogar_vencimientos";
 private static final String PREFS="hogar_local_notification_schedule";
 private static final int MAX_EVENTS=180;
 private ReminderSupport(){}

 static void setupChannel(Context context){
  if(Build.VERSION.SDK_INT>=26){
   NotificationManager nm=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
   if(nm==null)return;
   NotificationChannel c=new NotificationChannel(CHANNEL,"Recordatorios del hogar",NotificationManager.IMPORTANCE_DEFAULT);
   c.setDescription("Vencimientos de cuentas, cuotas y gastos recurrentes");
   c.enableVibration(true);nm.createNotificationChannel(c);
  }
 }
 static boolean canNotify(Context c){
  if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false;
  NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
  return nm!=null&&nm.areNotificationsEnabled();
 }
 static PendingIntent pending(Context c,JSONObject item,boolean create){
  String id=item.optString("id","");
  if(id.isEmpty())return null;
  Intent intent=new Intent(c,AlarmReceiver.class).setAction("com.hogarcompartido.app.SHOW_REMINDER");
  intent.setData(Uri.parse("hogar-reminder://notification/"+Uri.encode(id)));
  intent.putExtra("id",id);
  intent.putExtra("title",item.optString("title","Hogar Compartido"));
  intent.putExtra("body",item.optString("body","Revisá tus vencimientos."));
  int flags=(create?PendingIntent.FLAG_UPDATE_CURRENT:PendingIntent.FLAG_NO_CREATE)|PendingIntent.FLAG_IMMUTABLE;
  return PendingIntent.getBroadcast(c,id.hashCode(),intent,flags);
 }
 static void clear(Context c){
  SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
  try{
   JSONArray old=new JSONArray(p.getString("events","[]"));
   AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
   if(am!=null)for(int i=0;i<old.length();i++){
    JSONObject o=old.optJSONObject(i);if(o==null)continue;
    PendingIntent pi=pending(c,o,false);
    if(pi!=null){am.cancel(pi);pi.cancel();}
   }
  }catch(Exception ignored){}
  p.edit().remove("events").remove("account").remove("household").apply();
 }
 static void sync(Context c,String raw){
  try{
   if(raw==null||raw.length()>100000)return;
   JSONObject o=new JSONObject(raw);
   String account=o.optString("account",""),household=o.optString("household","");
   JSONArray a=o.optJSONArray("events");
   if(account.isEmpty()||account.length()>100||household.isEmpty()||household.length()>100||a==null)return;
   long now=System.currentTimeMillis();JSONArray valid=new JSONArray();
   for(int i=0;i<a.length()&&valid.length()<MAX_EVENTS;i++){
    JSONObject e=a.optJSONObject(i);if(e==null)continue;
    String id=e.optString("id",""),title=e.optString("title",""),body=e.optString("body","");
    long when=e.optLong("when",0);
    if(id.isEmpty()||id.length()>200||title.isEmpty()||title.length()>130||body.length()>220)continue;
    if(when<now+30000L||when>now+92L*86400000L)continue;
    valid.put(new JSONObject().put("id",id).put("title",title).put("body",body).put("when",when));
   }
   clear(c);
   c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
     .putString("account",account).putString("household",household).putString("events",valid.toString()).apply();
   reschedule(c);
  }catch(Exception ignored){}
 }
 static void reschedule(Context c){
  try{
   SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
   JSONArray events=new JSONArray(p.getString("events","[]"));
   AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
   if(am==null)return;
   long now=System.currentTimeMillis();
   for(int i=0;i<events.length();i++){
    JSONObject e=events.optJSONObject(i);if(e==null)continue;
    long when=e.optLong("when",0);if(when<now+1000L||when>now+92L*86400000L)continue;
    PendingIntent pi=pending(c,e,true);
    if(pi!=null)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi);
   }
  }catch(Exception ignored){}
 }
 static void test(Context c){
  if(!canNotify(c)){
   Toast.makeText(c,"Activá el permiso de notificaciones primero",Toast.LENGTH_LONG).show();return;
  }
  try{
   JSONObject test=new JSONObject().put("id","hogar-prueba")
    .put("title","Hogar Compartido · Prueba")
    .put("body","Las alertas pueden llegar aunque la app esté cerrada.")
    .put("when",System.currentTimeMillis()+12000L);
   AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
   if(am!=null)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,test.optLong("when"),pending(c,test,true));
   Toast.makeText(c,"Aviso de prueba programado (puede demorarse)",Toast.LENGTH_LONG).show();
  }catch(Exception ignored){}
 }
 public static final class Bridge{
  private final Activity a;
  public Bridge(Activity a){this.a=a;}
  @JavascriptInterface public void sync(String json){ReminderSupport.sync(a.getApplicationContext(),json);}
  @JavascriptInterface public void clear(){ReminderSupport.clear(a.getApplicationContext());}
  @JavascriptInterface public boolean isEnabled(){return ReminderSupport.canNotify(a);}
  @JavascriptInterface public void requestPermission(){
   a.runOnUiThread(()->{
    setupChannel(a);
    if(Build.VERSION.SDK_INT>=33&&a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
     a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},66);
    else Toast.makeText(a,"Permisos de notificaciones listos",Toast.LENGTH_LONG).show();
   });
  }
  @JavascriptInterface public void test(){a.runOnUiThread(()->ReminderSupport.test(a));}
 }
 public static final class AlarmReceiver extends BroadcastReceiver{
  @Override public void onReceive(Context c,Intent intent){
   if(!canNotify(c))return;
   String id=intent.getStringExtra("id");if(id==null||id.isEmpty())return;
   String title=intent.getStringExtra("title"),body=intent.getStringExtra("body");
   if(title==null)title="Hogar Compartido";if(body==null)body="Revisá tus vencimientos";
   setupChannel(c);
   Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
   PendingIntent click=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
   Notification.Builder b=(Build.VERSION.SDK_INT>=26)?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
   b.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body)
    .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(click)
    .setAutoCancel(true).setColor(Color.rgb(125,214,180)).setVisibility(Notification.VISIBILITY_PRIVATE);
   if(Build.VERSION.SDK_INT<26)b.setDefaults(Notification.DEFAULT_ALL).setPriority(Notification.PRIORITY_DEFAULT);
   NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
   if(nm!=null)nm.notify(id.hashCode(),b.build());
  }
 }
 public static final class BootReceiver extends BroadcastReceiver{
  @Override public void onReceive(Context c,Intent intent){
   String action=intent.getAction();
   if(Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_TIME_CHANGED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)){
    setupChannel(c);reschedule(c);
   }
  }
 }
}