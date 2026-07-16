export interface Message {
  id: string;
  sender: string;
  channel: string;
  zone: string;
  priority: 'normal' | 'urgent' | 'critical';
  status: 'queued' | 'relaying' | 'delivered';
  hops: number;
  time: string;
  text: string;
}

export interface Relay {
  id: string;
  name: string;
  zone: string;
  battery: number;
  hops: number;
  reach: string;
  active: boolean;
}

export interface Task {
  id: string;
  title: string;
  owner: string;
  deadline: string;
  completed: boolean;
}

export interface Capsule {
  id: string;
  title: string;
  unlock: string;
  note: string;
  status: 'sealed' | 'armed' | 'delivered';
}
