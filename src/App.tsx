import { useState } from 'react';
import ReactModal from 'react-modal';
import { ToastContainer } from 'react-toastify';
import Game from './components/Game.tsx';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';
import PoweredByConvex from './components/PoweredByConvex.tsx';
import LanguageSwitcher from './components/LanguageSwitcher.tsx';
import { useLocale } from './i18n/LocaleProvider';
import { returnCivilizationId, worldUrl } from './civilization/navigation';

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const { t, locale } = useLocale();
  const civilizationId = returnCivilizationId();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      <PoweredByConvex />
      <nav
        className="town-civilization-nav"
        aria-label={locale === 'zh' ? '文明导航' : 'Civilization navigation'}
      >
        <span>
          {locale === 'zh'
            ? '原聊天小镇 · 角色交流体验'
            : 'Original chat town · Character conversations'}
        </span>
        <a href={worldUrl(civilizationId, true)}>
          {locale === 'zh' ? '返回文明工作台' : 'Civilization workbench'}
        </a>
        <a href={worldUrl(civilizationId)}>
          {locale === 'zh' ? '进入文明像素世界' : 'Civilization world'}
        </a>
      </nav>
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        className="help-modal font-body"
        overlayClassName="help-overlay"
        contentLabel={t('help')}
        appElement={document.getElementById('root')!}
      >
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold font-display">{t('help')}</h1>
          <button type="button" className="help-close" onClick={() => setHelpModalOpen(false)}>
            {t('close')}
          </button>
        </div>
        <p>{t('welcome')}</p>
        <h2>{t('spectating')}</h2>
        <p>{t('watchHelp')}</p>
        <h2>{t('interactivity')}</h2>
        <p>{t('joinHelp')}</p>
        <p>{t('talkHelp')}</p>
        <p>{t('inputHelp')}</p>
        <p>{t('limitHelp', { count: MAX_HUMAN_PLAYERS })}</p>
        <p>{t('historyHelp')}</p>
      </ReactModal>
      <div className="w-full min-h-screen relative isolate overflow-x-clip lg:p-8 shadow-2xl flex flex-col justify-start town-layout">
        <LanguageSwitcher />
        <h1 className="mx-auto text-4xl px-3 pb-3 pt-20 sm:pt-12 sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wide game-title w-full text-center sm:w-auto">
          {t('title')}
        </h1>
        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-4 text-center text-base sm:text-xl md:text-2xl text-white leading-relaxed shadow-solid town-subtitle">
          {t('subtitle')}
        </div>
        <Game />
        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex flex-wrap gap-2 sm:gap-4 flex-grow pointer-events-none">
            <FreezeButton />
            <MusicButton />
            <Button href="https://github.com/a16z-infra/ai-town" imgUrl={starImg}>
              {t('star')}
            </Button>
            <InteractButton />
            <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              {t('help')}
            </Button>
          </div>
          <a href="https://a16z.com">
            <img className="w-8 h-8 pointer-events-auto" src={a16zImg} alt="a16z" />
          </a>
          <a href="https://convex.dev/c/ai-town">
            <img className="w-20 h-8 pointer-events-auto" src={convexImg} alt="Convex" />
          </a>
        </footer>
        <ToastContainer position="bottom-right" autoClose={3000} closeOnClick theme="dark" />
      </div>
    </main>
  );
}
