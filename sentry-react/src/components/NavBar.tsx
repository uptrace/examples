import { NavLink } from 'react-router-dom'

// NavBar links to the console and two item routes. Navigating between them mints
// a new navigation trace, which is the point of having more than one route.
export function NavBar() {
  return (
    <nav className="nav">
      <NavLink to="/" end className="nav__link">
        Home
      </NavLink>
      <NavLink to="/item/42" className="nav__link">
        Item 42
      </NavLink>
      <NavLink to="/item/foo" className="nav__link">
        Item foo
      </NavLink>
    </nav>
  )
}
