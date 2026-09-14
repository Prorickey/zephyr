import Taskbar from '@/components/Taskbar';
import Hero from '@/components/Hero';
import Overview from '@/components/sections/Overview';
import Autonomy from '@/components/sections/Autonomy';
import ScooterDesign from '@/components/sections/ScooterDesign';
import MobileApp from '@/components/sections/MobileApp';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Taskbar />
      <main>
        <Hero />
        <Overview />
        <Autonomy />
        <ScooterDesign />
        <MobileApp />
      </main>
      <Footer />
    </>
  );
}
