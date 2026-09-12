import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { App } from './App'
import { StoreProvider } from './store'
import './styles.css'

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
createRoot(document.getElementById('root')!).render(<StrictMode><StoreProvider><App /></StoreProvider></StrictMode>)
