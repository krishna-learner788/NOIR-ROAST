import Hero from '../components/sections/Hero'
import Roasts from '../components/sections/Roasts'
import Craft from '../components/sections/Craft'
import Origins from '../components/sections/Origins'
import Journal from '../components/sections/Journal'
import Visit from '../components/sections/Visit'
import { usePageMeta } from '../lib/meta'

// The original single-page experience, unchanged: same sections, same order, same markup.
export default function Home() {
  usePageMeta({
    description: 'NOIR ROAST — small-batch specialty coffee, roasted slowly in the dark.',
    path: '/',
  })
  return (
    <>
      <Hero />
      <Roasts />
      <Craft />
      <Origins />
      <Journal />
      <Visit />
    </>
  )
}
