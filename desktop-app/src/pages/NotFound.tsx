import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, Search } from "lucide-react";

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Illustration */}
        <div className="mb-8">
          <div className="text-9xl font-bold text-gray-700 select-none">404</div>
          <div className="text-xl text-gray-400 mt-2">Page Not Found</div>
        </div>

        {/* Description */}
        <p className="text-gray-500 mb-8">
          The page you're looking for doesn't exist or has been moved.
          Please check the URL or navigate back to a known page.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>

          <button
            onClick={() => navigate("/")}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </button>
        </div>

        {/* Quick Links */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <p className="text-gray-500 text-sm mb-4">Quick Links</p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/chat")}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Chat
            </button>
            <button
              onClick={() => navigate("/terminal")}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Terminal
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Search Suggestion */}
        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Search className="w-4 h-4" />
            <span>Looking for something specific? Try the search feature.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
