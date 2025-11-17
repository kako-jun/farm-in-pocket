import React from 'react'

function Logs() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-800">ログ</h2>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">システムログとポッドログの表示画面（実装予定）</p>
        <p className="text-sm text-gray-500 mt-2">
          ここではシステムログ、各ポッドのログ、エラーログなどを確認できます。
        </p>
      </div>
    </div>
  )
}

export default Logs
