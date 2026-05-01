import {
  IonContent,
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from "@ionic/react";
import { Route, Redirect } from "react-router-dom";
import { homeOutline, settingsOutline, trendingDownOutline } from "ionicons/icons";
import { useAuth } from "../context/AuthContext";
import CashierPage from "./CashierPage";
import ExpensePage from "./Expense";
import SettingsPage from "./SettingsPage";

export default function MainTabs() {
  const { ready, serverAuth } = useAuth();

  if (!ready) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="ice-loading">
            <div className="ice-spinner" aria-hidden />
            <span>Загрузка кассы…</span>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonTabs className="app-main-tabs">
      <IonRouterOutlet>
        <Route
          path="/tabs/cashier"
          exact
          render={() => (serverAuth ? <CashierPage /> : <Redirect to="/tabs/settings" />)}
        />
        <Route
          path="/tabs/expense"
          exact
          render={() => (serverAuth ? <ExpensePage /> : <Redirect to="/tabs/settings" />)}
        />
        <Route path="/tabs/settings" component={SettingsPage} exact />
        <Route
          path="/tabs"
          exact
          render={() => (
            <Redirect to={serverAuth ? "/tabs/cashier" : "/tabs/settings"} />
          )}
        />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" className="app-tab-bar">
        <IonTabButton
          tab="cashier"
          href="/tabs/cashier"
          className={serverAuth ? undefined : "app-tab-button--need-login"}
        >
          <IonIcon icon={homeOutline} />
          <IonLabel>Главная</IonLabel>
        </IonTabButton>
        <IonTabButton
          tab="expense"
          href="/tabs/expense"
          className={serverAuth ? undefined : "app-tab-button--need-login"}
        >
          <IonIcon icon={trendingDownOutline} />
          <IonLabel>Расход</IonLabel>
        </IonTabButton>
        <IonTabButton tab="settings" href="/tabs/settings">
          <IonIcon icon={settingsOutline} />
          <IonLabel>{serverAuth ? "Настройки" : "Вход"}</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
