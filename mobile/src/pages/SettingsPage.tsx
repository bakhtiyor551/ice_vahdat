import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
} from "@ionic/react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function SettingsPage() {
  const { session, serverAuth, online, login, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [presentToast] = useIonToast();

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
      setPin("");
      void presentToast({
        message: "Вход выполнен. Продажи будут уходить на сервер, чек — в Telegram.",
        duration: 3500,
        position: "top",
        color: "success",
      });
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
          <IonTitle>Настройки</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="settings-body">
        <div className="settings-inner">
          {!online ? <div className="offline-hint">Нет сети — вход на сервер недоступен.</div> : null}

          <p className="settings-lead">
            Чтобы после продажи уходил чек в Telegram, касса должна быть привязана к серверу: войдите под тем же
            телефоном и PIN, что заданы для кассира в админ-панели.
          </p>

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
                Выйти (локальный режим без синхронизации)
              </IonButton>
            </div>
          ) : (
            <div className="settings-card">
              <IonList lines="full">
                <IonItem>
                  <IonLabel position="stacked">Телефон</IonLabel>
                  <IonInput
                    type="tel"
                    inputMode="tel"
                    autocomplete="username"
                    placeholder="Например 992901234567"
                    value={phone}
                    onIonInput={(e) => setPhone(e.detail.value ?? "")}
                  />
                </IonItem>
                <IonItem>
                  <IonLabel position="stacked">PIN</IonLabel>
                  <IonInput
                    type="password"
                    autocomplete="current-password"
                    placeholder="PIN кассира"
                    value={pin}
                    onIonInput={(e) => setPin(e.detail.value ?? "")}
                  />
                </IonItem>
              </IonList>
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
                {busy ? "Вход…" : "Войти на сервер"}
              </IonButton>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
