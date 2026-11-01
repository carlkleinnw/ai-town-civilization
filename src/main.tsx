import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './App.tsx';
import './index.css';
import 'uplot/dist/uPlot.min.css';
import 'react-toastify/dist/ReactToastify.css';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';
import { LocaleProvider } from './i18n/LocaleProvider';
import CivilizationApp from './civilization/CivilizationApp';

function Page() {
  const [navigation, setNavigation] = React.useState({
    address: window.location.href,
    revision: 0,
  });
  React.useEffect(() => {
    // pushState is handled by the current page. A pop must remount even when it
    // returns to the same address with which this component originally mounted.
    const back = () =>
      setNavigation((previous) => ({
        address: window.location.href,
        revision: previous.revision + 1,
      }));
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const key = `${navigation.revision}:${navigation.address}`;
  return new URL(navigation.address).searchParams.get('view') === 'town' ? (
    <Home key={key} />
  ) : (
    <CivilizationApp key={key} />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexClientProvider>
      <LocaleProvider>
        <Page />
      </LocaleProvider>
    </ConvexClientProvider>
  </React.StrictMode>,
);
