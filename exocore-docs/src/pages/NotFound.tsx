import { Link } from "react-router-dom";

export function NotFound() {
    return (
        <div className="not-found">
            <h1>404</h1>
            <p>That page isn't in the docs yet. Try the <Link to="/">home page</Link> or use search.</p>
        </div>
    );
}
