"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LedgerEntry = {
  id: string;
  purchase_date: string;
  item_name: string;
  item_description: string;
  quantity: number;
  purchase_price: number;
  seller_name: string;
  seller_address: string;
  seller_age: number | null;
  seller_occupation: string;
  id_verification: string;
  transaction_type: string;
};

type NewItem = {
  item_name: string;
  item_description: string;
  quantity: number;
  purchase_price: number;
  purchase_date: string;
};

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerAge, setSellerAge] = useState("");
  const [sellerOccupation, setSellerOccupation] = useState("");
  const [idVerification, setIdVerification] = useState("");
  const [transactionType, setTransactionType] = useState("買受け");

  const [items, setItems] = useState<NewItem[]>([
    { item_name: "", item_description: "", quantity: 1, purchase_price: 0, purchase_date: new Date().toISOString().split('T')[0] }
  ]);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const res = await fetch("/api/ledger");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch");
      }
      const data = await res.json();
      setEntries(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    try {
      const res = await fetch(`/api/ledger?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setEntries(entries.filter(e => e.id !== id));
      } else {
        alert("削除に失敗しました");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addItemRow = () => {
    setItems([
      ...items,
      { item_name: "", item_description: "", quantity: 1, purchase_price: 0, purchase_date: new Date().toISOString().split('T')[0] }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof NewItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: true,
          seller_name: sellerName,
          seller_address: sellerAddress,
          seller_age: sellerAge ? parseInt(sellerAge) : null,
          seller_occupation: sellerOccupation,
          id_verification: idVerification,
          transaction_type: transactionType,
          items: items.map(item => ({
            ...item,
            quantity: Number(item.quantity),
            purchase_price: Number(item.purchase_price)
          }))
        })
      });

      if (!res.ok) {
        throw new Error("登録に失敗しました");
      }

      // Reset form and close modal
      setShowModal(false);
      setSellerName("");
      setSellerAddress("");
      setSellerAge("");
      setSellerOccupation("");
      setIdVerification("");
      setTransactionType("買受け");
      setItems([{ item_name: "", item_description: "", quantity: 1, purchase_price: 0, purchase_date: new Date().toISOString().split('T')[0] }]);
      
      // Refresh entries
      fetchEntries();
    } catch (err) {
      console.error(err);
      alert("登録エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-white">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="bg-gray-800 p-4 shadow flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/assess" className="text-gray-300 hover:text-white flex items-center">
            &larr; 査定に戻る
          </Link>
          <h1 className="text-xl font-bold">古物台帳</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow transition"
          >
            ＋ 新規登録
          </button>
          <a
            href="/api/ledger/csv"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition"
          >
            CSV出力
          </a>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="bg-gray-800 rounded-xl shadow overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-700 border-b border-gray-600">
                <th className="p-3 font-semibold text-gray-200">日付</th>
                <th className="p-3 font-semibold text-gray-200">取引区分</th>
                <th className="p-3 font-semibold text-gray-200">品目</th>
                <th className="p-3 font-semibold text-gray-200">数量</th>
                <th className="p-3 font-semibold text-gray-200">買取金額</th>
                <th className="p-3 font-semibold text-gray-200">相手方</th>
                <th className="p-3 font-semibold text-gray-200">年齢</th>
                <th className="p-3 font-semibold text-gray-200">職業</th>
                <th className="p-3 font-semibold text-gray-200">確認方法</th>
                <th className="p-3 font-semibold text-gray-200 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    台帳データがありません
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-750 text-sm">
                    <td className="p-3 whitespace-nowrap">{entry.purchase_date}</td>
                    <td className="p-3 whitespace-nowrap">{entry.transaction_type || '買受け'}</td>
                    <td className="p-3">{entry.item_name}</td>
                    <td className="p-3 whitespace-nowrap">{entry.quantity}</td>
                    <td className="p-3 whitespace-nowrap">¥{entry.purchase_price?.toLocaleString() || 0}</td>
                    <td className="p-3">{entry.seller_name}</td>
                    <td className="p-3 whitespace-nowrap">{entry.seller_age || '-'}</td>
                    <td className="p-3">{entry.seller_occupation || '-'}</td>
                    <td className="p-3">{entry.id_verification}</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-red-400 hover:text-red-300 transition"
                        title="削除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Registration Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">古物台帳 新規登録</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Seller Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-300 border-b border-gray-700 pb-2">取引相手の情報</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">氏名</label>
                      <input type="text" required value={sellerName} onChange={e => setSellerName(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-gray-400 mb-1">住所</label>
                      <input type="text" value={sellerAddress} onChange={e => setSellerAddress(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">年齢</label>
                      <input type="number" value={sellerAge} onChange={e => setSellerAge(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">職業</label>
                      <input type="text" value={sellerOccupation} onChange={e => setSellerOccupation(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">本人確認方法</label>
                      <input type="text" value={idVerification} onChange={e => setIdVerification(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="例: 運転免許証" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">取引区分</label>
                      <select value={transactionType} onChange={e => setTransactionType(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                        <option value="買受け">買受け</option>
                        <option value="委託">委託</option>
                        <option value="交換">交換</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Items Info */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-gray-700 pb-2">
                    <h3 className="text-lg font-semibold text-gray-300">取引品目</h3>
                    <button type="button" onClick={addItemRow} className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition">
                      ＋ 品目を追加
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-gray-900 p-4 rounded border border-gray-700 relative">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItemRow(idx)} className="absolute top-2 right-2 text-gray-500 hover:text-red-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                          <div className="lg:col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">品目</label>
                            <input type="text" required value={item.item_name} onChange={e => updateItem(idx, 'item_name', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                          <div className="lg:col-span-3">
                            <label className="block text-xs text-gray-400 mb-1">特徴</label>
                            <input type="text" value={item.item_description} onChange={e => updateItem(idx, 'item_description', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">数量</label>
                            <input type="number" min="1" required value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">買取金額(円)</label>
                            <input type="number" min="0" required value={item.purchase_price} onChange={e => updateItem(idx, 'purchase_price', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">日付</label>
                            <input type="date" required value={item.purchase_date} onChange={e => updateItem(idx, 'purchase_date', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-gray-300 hover:bg-gray-700 transition">
                    キャンセル
                  </button>
                  <button type="submit" disabled={submitting} className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow transition disabled:opacity-50">
                    {submitting ? '登録中...' : '登録する'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
