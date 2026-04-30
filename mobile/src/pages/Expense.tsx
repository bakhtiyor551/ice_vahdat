import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from "@ionic/react";
import { useCallback, useState } from "react";
import { v4 as uuid } from "uuid";
import { useAuth } from "../context/AuthContext";
import { qRun } from "../services/db";
import { runSyncOnce } from "../services/sync";

const EXPENSE_CATEGORIES = [
  "Молоко",
  "Сахар",
  "Сливки",
  "Сухое молоко",
  "Ванилин",
  "Стаканчики",
  "Рожки",
  "Ложки",
  "Салфетки",
  "Доставка",
  "Ремонт",
  "Аренда",
  "Электричество",
  "Прочее",
] as const;

const PAYMENT_ACCOUNTS = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
] as const;

export default function ExpensePage() {
  const { session, ready } = useAuth();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [paymentAccount, setPaymentAccount] = useState<(typeof PAYMENT_ACCOUNTS)[number]["value"]>("cash");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [presentToast] = useIonToast();

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
      setCategory(EXPENSE_CATEGORIES[0]);
      setPaymentAccount("cash");
      setComment("");
      void presentToast({ message: "Расход сохранён", duration: 2000, position: "top", color: "success" });
      void runSyncOnce();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }, [session, amount, category, paymentAccount, comment, presentToast]);

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
    <IonPage className="page-expense">
      <IonHeader className="ion-no-border">
        <IonToolbar className="expense-hero">
          <IonTitle>Учёт расходов</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="expense-body">
        <div className="expense-scroll-inner ice-content-wrap">
          <p className="expense-lead">
            Зафиксируйте закупку или трату: укажите сумму, категорию и с какого счёта списали (наличные, карта
            или перевод). Запись сохранится в телефоне и попадёт в синхронизацию, когда будет связь с сервером.
          </p>

          <div className="expense-form-card">
            <IonList lines="none">
              <IonItem>
                <IonLabel position="stacked">Сумма, сомони</IonLabel>
                <IonInput
                  type="number"
                  inputmode="decimal"
                  placeholder="0"
                  value={amount}
                  onIonInput={(e) => setAmount(String(e.detail.value ?? ""))}
                />
              </IonItem>
              <IonItem>
                <IonSelect
                  label="Категория"
                  labelPlacement="stacked"
                  interface="action-sheet"
                  value={category}
                  onIonChange={(e) => setCategory(String(e.detail.value))}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <IonSelectOption key={c} value={c}>
                      {c}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>
              <IonItem>
                <IonSelect
                  label="Счёт оплаты"
                  labelPlacement="stacked"
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
              </IonItem>
              <IonItem>
                <IonLabel position="stacked">Комментарий (необязательно)</IonLabel>
                <IonTextarea
                  autoGrow
                  rows={2}
                  placeholder="Например: поставщик, накладная №…"
                  value={comment}
                  onIonInput={(e) => setComment(String(e.detail.value ?? ""))}
                />
              </IonItem>
            </IonList>
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
