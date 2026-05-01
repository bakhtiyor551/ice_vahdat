import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonModal,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
  useIonToast,
  useIonViewWillEnter,
} from "@ionic/react";
import {
  addOutline,
  cloudOfflineOutline,
  logOutOutline,
  refreshOutline,
  removeOutline,
  syncOutline,
  trashOutline,
  wifiOutline,
} from "ionicons/icons";
import { Network } from "@capacitor/network";
import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { API_BASE } from "../config";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getToken, qAll, qRun } from "../services/db";
import { pullProducts } from "../services/productsSync";
import { runSyncOnce } from "../services/sync";

type Product = {
  id: number;
  name: string;
  price: number;
  image: string | null;
  category: string | null;
};

type PayKind = "cash" | "card" | "transfer" | "debt";

function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:") || u.startsWith("blob:")) {
    return u;
  }
  const base = API_BASE.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}${u.startsWith("/") ? u : `/${u}`}`;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = resolveImageUrl(product.image);

  return (
    <IonCard button onClick={onAdd} className="product-card">
      <div className="product-card__image-wrap">
        {src && !broken ? (
          <img
            className="product-card__img"
            src={src}
            alt=""
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="product-card__placeholder" aria-hidden>
            🍦
          </span>
        )}
      </div>
      <IonCardContent className="product-card__body">
        <div className="product-card__name">{product.name}</div>
        <div className="product-card__price">
          <span className="product-card__currency">{product.price}</span>
          <span className="product-card__price-unit"> сомони</span>
        </div>
        <div className="product-card__hint">Нажмите — добавить · ещё раз — ещё порция</div>
      </IonCardContent>
    </IonCard>
  );
}

export default function CashierPage() {
  const { session, ready, online, pendingSync, serverAuth, logout } = useAuth();
  const [catalogBusy, setCatalogBusy] = useState(false);
  const { lines, add, inc, dec, remove, clear, total } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<PayKind>("cash");
  const [clientAmount, setClientAmount] = useState("");
  const [debtComment, setDebtComment] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [presentToast] = useIonToast();

  const loadProducts = useCallback(async () => {
    const rows = await qAll<Product>(
      "SELECT id, name, price, image, category FROM products WHERE is_active = 1 ORDER BY category, name"
    );
    setProducts(rows);
    return rows.length;
  }, []);

  const pullCatalogFromServer = useCallback(async () => {
    const st = await Network.getStatus();
    if (!st.connected) return;
    try {
      await pullProducts(await getToken());
    } catch (e) {
      console.warn("pull catalog", e);
    }
  }, []);

  useIonViewWillEnter(() => {
    void (async () => {
      await pullCatalogFromServer();
      await loadProducts();
    })();
  });

  /** При готовности приложения и сети — сначала каталог с сервера, затем отрисовка из SQLite. */
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      if (online) await pullCatalogFromServer();
      await loadProducts();
    })();
  }, [ready, online, loadProducts, pullCatalogFromServer]);

  const refreshCatalog = useCallback(async () => {
    setCatalogBusy(true);
    try {
      await runSyncOnce();
      const n = await loadProducts();
      if (n === 0 && online) {
        void presentToast({
          message: `Каталог пустой. API: ${API_BASE || "(не задан)"}. Локально укажите IP ПК в mobile/.env; релиз — полный URL сервера: VITE_API_URL=https://домен.ru/api и пересборка.`,
          duration: 5500,
          position: "top",
          color: "warning",
        });
      } else if (n > 0) {
        void presentToast({ message: "Каталог обновлён", duration: 1500, position: "top", color: "success" });
      }
    } finally {
      setCatalogBusy(false);
    }
  }, [loadProducts, online, presentToast]);

  const productSections = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const cat = p.category?.trim() || "Другое";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries());
  }, [products]);

  const cartCount = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  const changePreview = useMemo(() => {
    if (paymentType !== "cash") return null;
    const c = parseFloat(clientAmount.replace(",", "."));
    if (Number.isNaN(c)) return null;
    return Math.max(0, c - total);
  }, [clientAmount, paymentType, total]);

  const openCheckout = () => {
    setErr("");
    setPaymentType("cash");
    setClientAmount("");
    setDebtComment("");
    setCheckoutOpen(true);
  };

  const confirmOrder = async () => {
    if (!session) return;
    setErr("");
    setSaving(true);
    try {
      let client_amount: number | null = null;
      let change_amount: number | null = null;
      let payment_meta: Record<string, string> | null = null;

      if (paymentType === "cash") {
        const c = parseFloat(clientAmount.replace(",", "."));
        if (Number.isNaN(c) || c < total) {
          setErr("Укажите «Клиент дал» не меньше итога");
          return;
        }
        client_amount = c;
        change_amount = c - total;
      } else if (paymentType === "debt") {
        payment_meta = { debt_comment: debtComment.trim() || "" };
      }

      const saleId = uuid();
      const localId = uuid();
      const createdAt = new Date().toISOString();

      const items = lines.map((l) => ({
        product_id: l.productId,
        product_name: l.name,
        quantity: l.quantity,
        price: l.price,
        total: l.price * l.quantity,
      }));

      await qRun(
        `INSERT INTO sales (id, local_id, cashier_id, total_amount, payment_type, client_amount, change_amount, payment_meta, created_at, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          saleId,
          localId,
          session.cashierId,
          total,
          paymentType,
          client_amount,
          change_amount,
          payment_meta ? JSON.stringify(payment_meta) : null,
          createdAt,
          "pending",
        ]
      );

      for (const it of items) {
        await qRun(
          `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, total) VALUES (?,?,?,?,?,?)`,
          [saleId, it.product_id, it.product_name, it.quantity, it.price, it.total]
        );
      }

      const payload = {
        id: saleId,
        local_id: localId,
        cashier_id: session.cashierId,
        total_amount: total,
        payment_type: paymentType,
        client_amount,
        change_amount,
        payment_meta,
        created_at: createdAt,
        items,
      };

      await qRun(
        `INSERT INTO sync_queue (entity_type, entity_id, payload_json, status, created_at) VALUES (?,?,?,?,?)`,
        ["sale", localId, JSON.stringify(payload), "pending", createdAt]
      );

      clear();
      setCheckoutOpen(false);
      if (online) {
        if (serverAuth) {
          void presentToast({ message: "Заказ оформлен", duration: 2000, position: "top", color: "success" });
        } else {
          void presentToast({
            message:
              "Продажа только в кассе: нет входа на сервер — чек в Telegram не отправлен. Вкладка «Настройки» → войдите (телефон и PIN).",
            duration: 5000,
            position: "top",
            color: "warning",
          });
        }
      } else {
        void presentToast({
          message: "Заказ сохранён офлайн. Чек в Telegram — после сети, входа в «Настройки» и синхронизации.",
          duration: 4000,
          position: "top",
          color: "success",
        });
      }
      void runSyncOnce();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="ice-loading">
            <div className="ice-spinner" aria-hidden />
            <span>Загрузка…</span>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage className={`page-cashier${lines.length > 0 ? " page-cashier--has-cart" : ""}`}>
      <IonHeader className="ion-no-border">
        <IonToolbar className="cashier-header-main">
          <IonButtons slot="start">
            <IonButton
              fill="clear"
              disabled={!online || catalogBusy}
              onClick={() => void refreshCatalog()}
              title="Загрузить каталог с сервера"
            >
              <IonIcon icon={refreshOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>Главная</IonTitle>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={() => void logout()}>
              <IonIcon slot="start" icon={logOutOutline} />
              Выйти
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar className="cashier-status-bar">
          <div className="cashier-status-inner">
            <span
              className={`status-badge ${online ? "status-badge--online" : "status-badge--offline"}`}
            >
              <IonIcon icon={online ? wifiOutline : cloudOfflineOutline} style={{ fontSize: "1rem" }} />
              {online ? "Онлайн" : "Офлайн"}
            </span>
            {pendingSync > 0 ? (
              <span className="status-badge status-badge--sync">
                <IonIcon icon={syncOutline} style={{ fontSize: "1rem" }} />
                К синхронизации: {pendingSync}
              </span>
            ) : (
              <span className="status-badge status-badge--sync" style={{ opacity: 0.85 }}>
                <IonIcon icon={syncOutline} style={{ fontSize: "1rem" }} />
                Очередь пуста
              </span>
            )}
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent scrollY fullscreen className="cashier-scroll page-main-scroll">
        {!serverAuth ? (
          <IonCard color="warning" className="ice-alert-card ion-margin-horizontal ion-margin-top">
            <IonCardContent className="ion-padding">
              <IonText>
                <p className="ion-no-margin">
                  Нет входа на сервер — продажи не синхронизируются и чек не уйдёт в Telegram. Откройте вкладку
                  «Настройки» и войдите (тот же телефон и PIN, что в админке для кассира).
                </p>
              </IonText>
              <IonButton className="ion-margin-top" size="small" routerLink="/tabs/settings" routerDirection="forward">
                Открыть настройки
              </IonButton>
            </IonCardContent>
          </IonCard>
        ) : null}
        <div className="ice-content-wrap">
          <div className="cashier-menu-intro">
            <span className="cashier-main-pill">Главная</span>
            <h2>Меню</h2>
            <p>Нажмите на карточку — товар попадёт в корзину. Повторное нажатие увеличит количество.</p>
          </div>

          {products.length === 0 ? (
            <div className="empty-catalog">
            <div className="empty-catalog__icon" aria-hidden>
              🧁
            </div>
            <h3>Каталог пуст</h3>
            <p>
              Включите интернет, нажмите «обновить» в шапке. Для сборки APK задайте{" "}
              <code>VITE_API_URL</code>: локально — IP ПК с бэкендом; на проде —{" "}
              <code>https://ваш-домен.ru/api</code>. Сейчас: <code>{API_BASE || "не задан — пересоберите"}</code>.
            </p>
            <IonButton
              expand="block"
              disabled={!online || catalogBusy}
              onClick={() => void refreshCatalog()}
            >
              <IonIcon slot="start" icon={refreshOutline} />
              Загрузить каталог
            </IonButton>
          </div>
        ) : (
          productSections.map(([category, items]) => (
            <section key={category} className="product-section">
              <h3 className="product-section__title">{category}</h3>
              <div className="product-grid">
                {items.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onAdd={() => add({ id: p.id, name: p.name, price: p.price })}
                  />
                ))}
              </div>
            </section>
          ))
          )}
        </div>
      </IonContent>

      {lines.length > 0 ? (
        <IonFooter className="cart-footer">
          <div className="cart-footer__shell">
            <div className="cart-footer__head">
              <h3 className="cart-footer__title">Корзина</h3>
              <span className="cart-count-pill">{cartCount}</span>
            </div>
            <div className="cart-footer__lines">
              {lines.map((l) => {
                const lineTotal = l.price * l.quantity;
                return (
                  <div key={l.productId} className="cart-line">
                    <div className="cart-line__info">
                      <span className="cart-line__name">
                        {l.name}
                        <IonText color="medium">
                          <span style={{ fontWeight: 600 }}> ×{l.quantity}</span>
                        </IonText>
                      </span>
                      <span className="cart-line__sum">{lineTotal} сом</span>
                    </div>
                    <div className="cart-line__meta">
                      <span className="cart-line__unit">
                        {l.price} сом × {l.quantity} шт
                      </span>
                      <div className="cart-line__actions">
                        <IonButton
                          className="stepper"
                          fill="outline"
                          color="primary"
                          onClick={() => dec(l.productId)}
                        >
                          <IonIcon slot="icon-only" icon={removeOutline} />
                        </IonButton>
                        <IonButton
                          className="stepper"
                          fill="solid"
                          color="primary"
                          onClick={() => inc(l.productId)}
                        >
                          <IonIcon slot="icon-only" icon={addOutline} />
                        </IonButton>
                        <IonButton fill="clear" color="danger" onClick={() => remove(l.productId)}>
                          <IonIcon slot="icon-only" icon={trashOutline} />
                        </IonButton>
                      </div>
                    </div>
                  </div>
                );
              })}
              <IonButton className="btn-clear" size="small" fill="clear" color="medium" onClick={() => clear()}>
                Очистить корзину
              </IonButton>
            </div>
            <div className="cart-footer__total-row">
              <span className="cart-footer__total-label">Итого к оплате</span>
              <span className="cart-footer__total">{total} сомони</span>
            </div>
            <IonToolbar className="cart-footer__toolbar">
              <IonButton expand="block" className="cta-checkout" onClick={() => openCheckout()}>
                Оформить заказ
              </IonButton>
            </IonToolbar>
          </div>
        </IonFooter>
      ) : null}

      <IonModal
        className="checkout-modal"
        isOpen={checkoutOpen}
        onDidDismiss={() => setCheckoutOpen(false)}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Оплата заказа</IonTitle>
            <IonButtons slot="end">
              <IonButton fill="clear" onClick={() => setCheckoutOpen(false)}>
                Закрыть
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent scrollY fullscreen={false} className="ion-padding checkout-modal__body">
          <div className="checkout-modal__inner ice-content-wrap">
            <div className="checkout-total-card">
              <div className="checkout-total-card__label">Сумма к оплате</div>
              <div className="checkout-total-card__sum">
                {total}{" "}
                <span className="checkout-total-card__currency">сомони</span>
              </div>
            </div>

            <div className="checkout-section-label">Способ оплаты</div>
            <IonSegment
              className="payment-segment"
              value={paymentType}
              onIonChange={(e) => setPaymentType((e.detail.value as PayKind) || "cash")}
              scrollable
            >
              <IonSegmentButton value="cash">
                <IonLabel>Наличные</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="card">
                <IonLabel>Карта</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="transfer">
                <IonLabel>Перевод</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="debt">
                <IonLabel>Долг</IonLabel>
              </IonSegmentButton>
            </IonSegment>

            {paymentType === "cash" ? (
              <div className="checkout-fields-block">
                <div className="checkout-field">
                  <label className="checkout-field-label" htmlFor="checkout-client-amount">
                    Клиент дал
                  </label>
                  <IonInput
                    id="checkout-client-amount"
                    type="number"
                    inputmode="decimal"
                    enterkeyhint="done"
                    placeholder="0"
                    value={clientAmount}
                    className="checkout-field-input"
                    onIonInput={(e) => setClientAmount(String(e.detail.value ?? ""))}
                  />
                </div>
                {changePreview !== null ? (
                  <div className="checkout-change-row">
                    <span className="checkout-change-label">Сдача</span>
                    <strong className="checkout-change-value">{changePreview.toFixed(2)} сомони</strong>
                  </div>
                ) : null}
              </div>
            ) : null}

            {paymentType === "debt" ? (
              <div className="checkout-fields-block">
                <div className="checkout-field">
                  <label className="checkout-field-label" htmlFor="checkout-debt-comment">
                    Имя клиента / комментарий
                  </label>
                  <IonInput
                    id="checkout-debt-comment"
                    enterkeyhint="done"
                    value={debtComment}
                    className="checkout-field-input"
                    onIonInput={(e) => setDebtComment(String(e.detail.value ?? ""))}
                  />
                </div>
              </div>
            ) : null}

            {paymentType === "card" || paymentType === "transfer" ? (
              <IonText color="medium">
                <p className="checkout-hint-text ion-margin-top">
                  Проверьте сумму и подтвердите — дополнительные поля не нужны.
                </p>
              </IonText>
            ) : null}

            {err ? (
              <IonText color="danger" className="error-text">
                <p className="ion-no-margin">{err}</p>
              </IonText>
            ) : null}
          </div>
        </IonContent>

        <IonFooter className="ion-no-border checkout-modal__footer">
          <IonToolbar className="checkout-modal__footer-toolbar">
            <IonButton
              expand="block"
              className="confirm-order-btn"
              disabled={saving}
              onClick={() => void confirmOrder()}
            >
              Подтвердить заказ
            </IonButton>
          </IonToolbar>
        </IonFooter>
      </IonModal>
    </IonPage>
  );
}
