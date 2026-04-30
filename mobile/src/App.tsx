import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Redirect, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import MainTabs from "./pages/MainTabs";

import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

import "./theme/variables.css";
import "./theme/app.css";

setupIonicReact();

export default function App() {
  return (
    <IonApp>
      <AuthProvider>
        <CartProvider>
          <IonReactRouter>
            <IonRouterOutlet>
              <Route path="/tabs" component={MainTabs} />
              <Route path="/" exact render={() => <Redirect to="/tabs/cashier" />} />
            </IonRouterOutlet>
          </IonReactRouter>
        </CartProvider>
      </AuthProvider>
    </IonApp>
  );
}
