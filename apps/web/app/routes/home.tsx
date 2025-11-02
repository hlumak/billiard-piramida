import type { Route } from './+types/home';
import { Welcome } from '../welcome/welcome';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'New React Router App' },
    { name: 'description', content: 'Welcome to React Router!' }
  ];
}

export async function clientLoader() {
  const res = await fetch('http://localhost:3000/');
  const helloWorld = await res.text();
  return helloWorld;
}

export function HydrateFallback() {
  return <div>Loading...</div>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Welcome data={loaderData} />;
}
