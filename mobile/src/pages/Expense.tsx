import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from "@ionic/react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { v4 as uuid } from "uuid";
import { useAuth } from "../context/AuthContext";
import { getToken, qRun } from "../services/db";
import { runSyncOnce } from "../services/sync";

const FALLBACK_EXPENSE_CATEGORIES = [
  "Молоко",
  "Сахар",
  "Сливки",
  "Сухое молоко",
  "Ванилин",
  "Стаканчики",
  "Рожки",
  "Ложки",
  "Салфетки",
  "Упаковка мороженого 2 сомони",
  "Упаковка мороженого 3 сомони",
  "Упаковка мороженого 5 сомони",
  "Упаковка мороженого 7 сомони",
  "Доставка",
  "Ремонт",
  "Аренда",
  "Электричество",
  "Вода",
  "Реклама",
  "Прочее",
] as const;

const PAYMENT_ACCOUNTS = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
] as const;

export default function ExpensePage() {
  const { session, serverAuth } = useAuth();
  const [amount, setAmount] = useState("");
  const [categories, setCategories] = useState<string[]>([...FALLBACK_EXPENSE_CATEGORIES]);
  const [category, setCategory] = useState<string>(FALLBACK_EXPENSE_CATEGORIES[0]);
  const [paymentAccount, setPaymentAccount] = useState<(typeof PAYMENT_ACCOUNTS)[number]["value"]>("cash");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [presentToast] = useIonToast();

  useEffect(() => {
    if (!serverAuth) return;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const list = await apiFetch<string[]>("/expenses/categories", { token });
        if (Array.isArray(list) && list.length > 0) {
          setCategories(list);
          setCategory((prev) => (list.includes(prev) ? prev : list[0]));
        }
      } catch {
        /* офлайн — остаётся локальный список */
      }
    })();
  }, [serverAuth]);

  const save = useCallback(async () => {
    if (!session) return;
    setErr("");
    const amt = parseFloat(amount.replace(",", "."));
    if (Number.isNaN(amt) || amt <= 0) {
      setErr("Введите сумму");
      return;
    }

    setSaving(true);
    try {
      const id = uuid();
      const localId = uuid();
      const createdAt = new Date().toISOString();

      await qRun(
        `INSERT INTO expenses (id, local_id, cashier_id, amount, category, payment_type, comment, photo_path, created_at, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          localId,
          session.cashierId,
          amt,
          category,
          paymentAccount,
          comment.trim() || null,
          null,
          createdAt,
          "pending",
        ]
      );

      const payload = {
        id,
        local_id: localId,
        cashier_id: session.cashierId,
        amount: amt,
        category,
        payment_type: paymentAccount,
        comment: comment.trim() || null,
        photo_path: null,
        created_at: createdAt,
      };

      await qRun(
        `INSERT INTO sync_queue (entity_type, entity_id, payload_json, status, created_at) VALUES (?,?,?,?,?)`,
        ["expense", localId, JSON.stringify(payload), "pending", createdAt]
      );

      setAmount("");
      setCategory(categories[0] ?? FALLBACK_EXPENSE_CATEGORIES[0]);
      setPaymentAccount("cash");
      setComment("");
      void presentToast({ message: "Расход сохранён", duration: 2000, position: "top", color: "success" });
      void runSyncOnce();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }, [session, amount, category, categories, paymentAccount, comment, presentToast]);

  return (
    <IonPage className="page-expense">
      <IonHeader className="ion-no-border">
        <IonToolbar className="expense-hero">
          <IonTitle>Расход</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY fullscreen className="expense-body page-expense-scroll">
        <div className="expense-scroll-inner ice-content-wrap">
          <span className="expense-tab-pill">Вкладка «Расход»</span>
          <p className="expense-lead">
            Зафиксируйте закупку или трату: сумма, категория и счёт (наличные, карта или перевод). Запись
            сохранится на телефоне и уйдёт на сервер при связи.
          </p>

          <div className="expense-form-card expense-form-card--fields">
            <div className="expense-field expense-field--full">
              <label className="expense-field-label" htmlFor="expense-amount">
                Сумма, сомони
              </label>
              <IonInput
                id="expense-amount"
                type="number"
                inputmode="decimal"
                placeholder="0"
                value={amount}
                className="expense-field-input"
                onIonInput={(e) => setAmount(String(e.detail.value ?? ""))}
              />
            </div>
            <div className="expense-field">
              <span className="expense-field-label">Категория</span>
              <IonSelect
                className="expense-field-select"
                interface="action-sheet"
                value={category}
                onIonChange={(e) => setCategory(String(e.detail.value))}
              >
                {categories.map((c) => (
                  <IonSelectOption key={c} value={c}>
                    {c}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </div>
            <div className="expense-field">
              <span className="expense-field-label">Счёт оплаты</span>
              <IonSelect
                className="expense-field-select"
                interface="action-sheet"
                value={paymentAccount}
                onIonChange={(e) =>
                  setPaymentAccount((e.detail.value as (typeof PAYMENT_ACCOUNTS)[number]["value"]) || "cash")
                }
              >
                {PAYMENT_ACCOUNTS.map((p) => (
                  <IonSelectOption key={p.value} value={p.value}>
                    {p.label}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </div>
            <div className="expense-field expense-field--full">
              <label className="expense-field-label" htmlFor="expense-comment">
                Комментарий (необязательно)
              </label>
              <IonTextarea
                id="expense-comment"
                className="expense-field-textarea"
                autoGrow
                rows={2}
                placeholder="Например: поставщик, накладная №…"
                value={comment}
                onIonInput={(e) => setComment(String(e.detail.value ?? ""))}
              />
            </div>
          </div>

          {err ? (
            <div className="error-banner" role="alert">
              <IonText color="danger">
                <p className="ion-no-margin">{err}</p>
              </IonText>
            </div>
          ) : null}

          <IonButton expand="block" className="save-expense-btn" onClick={() => void save()} disabled={saving}>
            Сохранить расход
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
}
