/** Personajes del guion de pitch: sus historiales se fijan a mano para que la historia cierre. */
export const PERSONAS = {
  pedro: { id: "client-pedro", name: "Pedro Martínez", phone: "+18095550101" },
  jose: { id: "client-jose", name: "José Ramírez", phone: "+18095550102" },
  ana: { id: "client-ana", name: "Ana Gómez", phone: "+18095550103" },
  juan: { id: "client-juan", name: "Juan Pérez", phone: "+18095550104" },
} as const;

export type PersonaKey = keyof typeof PERSONAS;

export const MALE_NAMES = [
  "Ángel", "Manuel", "Francisco", "Ramón", "Héctor", "Wilson", "Félix", "Julio", "Domingo", "Elvis",
  "Alexander", "Kelvin", "Junior", "Yeison", "Wander", "Starlin", "Edwin", "Franklin", "Jonathan", "Daniel",
  "David", "Samuel", "Jorge", "Ricardo", "Fernando", "Andrés", "Eduardo", "Leonel", "Pablo", "Rubén",
  "Rolando", "Ernesto", "Darío", "Omar", "Freddy", "Víctor", "Henry", "Robinson", "Anderson", "Nelson",
  "Melvin", "Cristian", "Raúl", "Enmanuel", "Joel", "Bryan", "Abel", "Tomás", "Gabriel", "Esteban",
];

export const FEMALE_NAMES = [
  "María", "Carmen", "Rosa", "Yanelis", "Yokasta", "Daniela", "Paola", "Laura", "Patricia", "Massiel",
  "Carolina", "Esther", "Gabriela", "Lissette", "Sofía", "Valeria", "Yesenia", "Altagracia", "Johanna", "Indhira",
];

export const LAST_NAMES = [
  "Rodríguez", "Martínez", "Pérez", "García", "Gómez", "Santos", "Reyes", "Díaz", "Hernández", "Peña",
  "Jiménez", "Ramírez", "Castillo", "Núñez", "Taveras", "Báez", "Mejía", "Rosario", "Féliz", "Polanco",
  "Almonte", "Cabrera", "Vásquez", "Guzmán", "De la Cruz", "Mercedes", "Batista", "Encarnación", "Tejada", "Ureña",
];
