import UnoGame from './UnoGame';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-100 to-blue-200 p-8">
      <main className="max-w-4xl mx-auto">
        <UnoGame />
      </main>
    </div>
  );
}
