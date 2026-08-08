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
  id_verification: string;
};

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
        <a
          href="/api/ledger/csv"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition"
        >
          CSV出力
        </a>
      </header>

      <main className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="bg-gray-800 rounded-xl shadow overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-700 border-b border-gray-600">
                <th className="p-4 font-semibold text-gray-200">日付</th>
                <th className="p-4 font-semibold text-gray-200">品目</th>
                <th className="p-4 font-semibold text-gray-200">数量</th>
                <th className="p-4 font-semibold text-gray-200">買取金額</th>
                <th className="p-4 font-semibold text-gray-200">相手方</th>
                <th className="p-4 font-semibold text-gray-200">確認方法</th>
                <th className="p-4 font-semibold text-gray-200 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    台帳データがありません
                  </td>
                </tr>
              ) : (
                entries.map(entry => (
                  <tr key={entry.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="p-4">{entry.purchase_date}</td>
                    <td className="p-4">{entry.item_name}</td>
                    <td className="p-4">{entry.quantity}</td>
                    <td className="p-4">¥{entry.purchase_price?.toLocaleString() || 0}</td>
                    <td className="p-4">{entry.seller_name}</td>
                    <td className="p-4">{entry.id_verification}</td>
                    <td className="p-4 text-center">
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
    </div>
  );
}
