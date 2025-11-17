import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ModuleManage from './pages/ModuleManage'
import Logs from './pages/Logs'
import Settings from './pages/Settings'

function App() {
  return (
    <Router>
      <div className="min-h-screen">
        <nav className="bg-green-600 text-white shadow-lg">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">🌾</span>
                <h1 className="text-xl font-bold">Farm in Pocket</h1>
              </div>
              <div className="flex space-x-4">
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    isActive ? "text-green-200 font-semibold" : "hover:text-green-200"
                  }
                >
                  ダッシュボード
                </NavLink>
                <NavLink
                  to="/modules"
                  className={({ isActive }) =>
                    isActive ? "text-green-200 font-semibold" : "hover:text-green-200"
                  }
                >
                  ポッド
                </NavLink>
                <NavLink
                  to="/logs"
                  className={({ isActive }) =>
                    isActive ? "text-green-200 font-semibold" : "hover:text-green-200"
                  }
                >
                  ログ
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    isActive ? "text-green-200 font-semibold" : "hover:text-green-200"
                  }
                >
                  設定
                </NavLink>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/modules" element={<ModuleManage />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        <footer className="bg-gray-800 text-white text-center py-4 mt-12">
          <p>Farm in Pocket - 農業の未来をポケットに</p>
          <p className="text-sm text-gray-400 mt-1">v0.1.0</p>
        </footer>
      </div>
    </Router>
  )
}

export default App
