import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-4">
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-indigo-700 mb-2">Flomerce</h1>
          <p className="text-gray-500 text-lg">Plateforme de gestion des retours & réclamations</p>
        </div>

        <p className="text-gray-600 text-xl mb-10 leading-relaxed">
          Simplifiez la gestion de vos retours clients grâce à une politique
          configurable et un traitement intelligent par IA.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/register"
            className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Devenir vendeur
          </Link>
          <Link
            href="/auth/login"
            className="bg-white text-indigo-600 border-2 border-indigo-600 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-indigo-50 transition-colors"
          >
            Se connecter
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-3xl mb-3">🛡️</div>
            <h3 className="font-semibold text-gray-800 mb-2">Politique personnalisée</h3>
            <p className="text-gray-500 text-sm">Définissez vos règles de retour selon votre activité</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-semibold text-gray-800 mb-2">Validation IA</h3>
            <p className="text-gray-500 text-sm">Automatisez l&apos;approbation des réclamations avec l&apos;IA</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-3xl mb-3">🔑</div>
            <h3 className="font-semibold text-gray-800 mb-2">API intégrée</h3>
            <p className="text-gray-500 text-sm">Connectez votre boutique via notre API REST</p>
          </div>
        </div>
      </div>
    </main>
  );
}
