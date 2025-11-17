import React, { useEffect } from 'react'
import { useSystemStore } from '../store/systemStore'
import { useModulesStore } from '../store/modulesStore'

function Dashboard() {
  const {
    status,
    loading: systemLoading,
    error: systemError,
    fetchStatus,
    getCpuUsagePercent,
    getMemoryUsagePercent,
    getUptimeFormatted
  } = useSystemStore()

  const {
    modules,
    loading: modulesLoading,
    error: modulesError,
    fetchModules,
    startModule,
    stopModule,
    restartModule
  } = useModulesStore()

  useEffect(() => {
    fetchStatus()
    fetchModules()

    // 30秒ごとに更新
    const interval = setInterval(() => {
      fetchStatus()
      fetchModules()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchStatus, fetchModules])

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
  }

  const getStatusIcon = (status) => {
    const icons = {
      running: '✅',
      stopped: '⚫',
      error: '❌',
      warning: '⚠️'
    }
    return icons[status] || '❓'
  }

  const getStatusText = (status) => {
    const texts = {
      running: '稼働中',
      stopped: '停止中',
      error: 'エラー',
      warning: '警告'
    }
    return texts[status] || '不明'
  }

  const getStatusClass = (status) => {
    const classes = {
      running: 'text-green-600 font-semibold',
      stopped: 'text-gray-600',
      error: 'text-red-600 font-semibold',
      warning: 'text-yellow-600 font-semibold'
    }
    return classes[status] || 'text-gray-600'
  }

  const handleStartModule = async (moduleName) => {
    try {
      await startModule(moduleName)
    } catch (error) {
      alert(`ポッドの起動に失敗しました: ${error.message}`)
    }
  }

  const handleStopModule = async (moduleName) => {
    try {
      await stopModule(moduleName)
    } catch (error) {
      alert(`ポッドの停止に失敗しました: ${error.message}`)
    }
  }

  const handleRestartModule = async (moduleName) => {
    try {
      await restartModule(moduleName)
    } catch (error) {
      alert(`ポッドの再起動に失敗しました: ${error.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-800 flex items-center">
        <span className="text-4xl mr-3">🌾</span>
        Farm in Pocket Dashboard
      </h2>

      {/* システム情報 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">システム情報</h3>
        {systemLoading ? (
          <div className="text-center py-4">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        ) : systemError ? (
          <div className="text-center py-4">
            <p className="text-red-500">エラー: {systemError}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">CPU使用率</p>
              <p className="text-3xl font-bold text-blue-600">{getCpuUsagePercent().toFixed(1)}%</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">メモリ</p>
              <p className="text-3xl font-bold text-green-600">
                {formatBytes(status?.memory_used)} / {formatBytes(status?.memory_total)}
              </p>
              <p className="text-sm text-gray-500">{getMemoryUsagePercent().toFixed(1)}%</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">稼働時間</p>
              <p className="text-3xl font-bold text-purple-600">{getUptimeFormatted()}</p>
            </div>
          </div>
        )}
      </div>

      {/* 導入済みポッド */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">導入済みポッド</h3>
        {modulesLoading ? (
          <div className="text-center py-4">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        ) : modulesError ? (
          <div className="text-center py-4">
            <p className="text-red-500">エラー: {modulesError}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((module) => (
              <div
                key={module.name}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getStatusIcon(module.status)}</span>
                      <div>
                        <h4 className="font-semibold text-lg">{module.name}</h4>
                        <p className="text-sm text-gray-500">{module.description}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                      <span>バージョン: {module.version}</span>
                      <span className={getStatusClass(module.status)}>
                        {getStatusText(module.status)}
                      </span>
                    </div>
                    {module.metrics && (
                      <div className="mt-2 text-sm">
                        {Object.entries(module.metrics).map(([key, value]) => (
                          <span key={key} className="mr-4">
                            {key}: <strong>{value}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    {module.status !== 'running' && (
                      <button
                        onClick={() => handleStartModule(module.name)}
                        className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                      >
                        起動
                      </button>
                    )}
                    {module.status === 'running' && (
                      <button
                        onClick={() => handleStopModule(module.name)}
                        className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                      >
                        停止
                      </button>
                    )}
                    <button
                      onClick={() => handleRestartModule(module.name)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      再起動
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
