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
import { cashOutline, settingsOutline, trendingDownOutline } from "ionicons/icons";
import { useAuth } from "../context/AuthContext";
import CashierPage from "./CashierPage";
import ExpensePage from "./Expense";
import SettingsPage from "./SettingsPage";

export default function MainTabs() {
  const { ready } = useAuth();

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
        <Route path="/tabs/cashier" component={CashierPage} exact />
        <Route path="/tabs/expense" component={ExpensePage} exact />
        <Route path="/tabs/settings" component={SettingsPage} exact />
        <Route path="/tabs" exact render={() => <Redirect to="/tabs/cashier" />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" className="app-tab-bar">
        <IonTabButton tab="cashier" href="/tabs/cashier">
          <IonIcon icon={cashOutline} />
          <IonLabel>Касса</IonLabel>
        </IonTabButton>
        <IonTabButton tab="expense" href="/tabs/expense">
          <IonIcon icon={trendingDownOutline} />
          <IonLabel>Расход</IonLabel>
        </IonTabButton>
        <IonTabButton tab="settings" href="/tabs/settings">
          <IonIcon icon={settingsOutline} />
          <IonLabel>Настройки</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </IonTabs>
  );
}
