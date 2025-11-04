import Home from "./pages/Home.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/app.css";

export default function App(){
  return (
    <main>
      <ErrorBoundary>
        <Home />
      </ErrorBoundary>
    </main>
  );
}
