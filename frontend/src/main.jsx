import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './theme-colors.css'
import './index.css'
import './layout.css'
import './responsive.css'
import './profile.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
