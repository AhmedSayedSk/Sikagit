import './App.css'
import { AppShell } from './components/layout/AppShell'
import { ToastContainer } from './components/ui/ToastContainer'
import { ConfirmDialog } from './components/ui/ConfirmDialog'

function App() {
  return (
    <>
      <AppShell />
      <ToastContainer />
      <ConfirmDialog />
    </>
  )
}

export default App
