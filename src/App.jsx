import { MotionConfig } from 'framer-motion'
import Nav from './components/sections/Nav'
import Hero from './components/sections/Hero'
import Roasts from './components/sections/Roasts'
import Craft from './components/sections/Craft'
import Origins from './components/sections/Origins'
import Journal from './components/sections/Journal'
import Visit from './components/sections/Visit'
import Footer from './components/sections/Footer'
import ScrollProgress from './components/ui/ScrollProgress'

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="skip-link">Skip to main content</a>
      <ScrollProgress />
      <Nav />
      <main id="main">
        <Hero />
        <Roasts />
        <Craft />
        <Origins />
        <Journal />
        <Visit />
      </main>
      <Footer />
    </MotionConfig>
  )
}
