import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from "@ionic/react";
import { useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LAST_PHONE_KEY = "ice_cashier_phone";

export default function SettingsPage() {
  const history = useHistory();
  const { session, serverAuth, online, login, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [presentToast] = useIonToast();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_PHONE_KEY);
      if (saved) setPhone(saved);
    } catch {
      /* WebView без storage */
    }
  }, []);

  const onLogin = async () => {
    setErr("");
    const p = phone.replace(/\D/g, "");
    if (p.length < 9) {
      setErr("Введите номер телефона кассира (как в админке)");
      return;
    }
    if (pin.length < 4) {
      setErr("Введите PIN (4+ цифр)");
      return;
    }
    setBusy(true);
    try {
      await login(p, pin);
      try {
        localStorage.setItem(LAST_PHONE_KEY, p);
      } catch {
        /* ignore */
      }
      setPin("");
      void presentToast({
        message: "Вход выполнен. Продажи будут уходить на сервер, чек — в Telegram.",
        duration: 3500,
        position: "top",
        color: "success",
      });
      history.replace("/tabs/cashier");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage className="page-settings">
      <IonHeader className="ion-no-border settings-hero">
        <IonToolbar>
          <IonTitle>{serverAuth ? "Настройки" : "Вход кассира"}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="settings-body" fullscreen scrollY>
        <div className="settings-inner">
          {!online ? <div className="offline-hint">Нет сети — вход по телефону и PIN недоступен.</div> : null}

          {!serverAuth ? (
            <p className="settings-lead">
              Используйте тот же <strong>номер телефона</strong> и <strong>PIN</strong>, что заданы для кассира в
              админ-панели. Без входа разделы «Главная» и «Расход» недоступны.
            </p>
          ) : (
            <p className="settings-lead">
              Вы вошли на сервер — продажи и расходы синхронизируются, чеки уходят в Telegram (если настроен бот).
            </p>
          )}

          {serverAuth ? (
            <div className="settings-card">
              <div className="settings-status">
                <p className="name">{session?.name}</p>
                <p className="phone">{session?.phone}</p>
              </div>
              <IonButton
                expand="block"
                color="medium"
                className="settings-logout-btn ion-margin"
                onClick={() => void logout()}
              >
                Выйти
              </IonButton>
            </div>
          ) : (
            <div className="settings-card settings-card--login">
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="cashier-phone">
                  Телефон кассира
                </label>
                <IonInput
                  id="cashier-phone"
                  type="tel"
                  inputMode="tel"
                  autocomplete="username"
                  placeholder="Например 992901234567"
                  value={phone}
                  className="settings-field-input"
                  onIonInput={(e) => setPhone(e.detail.value ?? "")}
                />
              </div>
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="cashier-pin">
                  PIN
                </label>
                <IonInput
                  id="cashier-pin"
                  type="password"
                  autocomplete="current-password"
                  placeholder="PIN из админки"
                  value={pin}
                  className="settings-field-input"
                  onIonInput={(e) => setPin(e.detail.value ?? "")}
                />
              </div>
              {err ? (
                <IonText color="danger">
                  <p className="ion-padding-horizontal ion-padding-bottom">{err}</p>
                </IonText>
              ) : null}
              <IonButton
                expand="block"
                className="settings-login-btn ion-margin"
                disabled={!online || busy}
                onClick={() => void onLogin()}
              >
                {busy ? "Вход…" : "Войти"}
              </IonButton>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
