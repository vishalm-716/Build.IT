export const quickBursts = [
  {
    label: 'SOS',
    payload: {
      channel: 'Emergency',
      priority: 'critical',
      text: 'Immediate extraction needed. Civilians trapped and requesting guided relay support.'
    }
  },
  {
    label: 'Medic',
    payload: {
      channel: 'Medical',
      priority: 'urgent',
      text: 'Medical relay requested. Carry trauma kit, insulin, and portable lamp.'
    }
  },
  {
    label: 'Food',
    payload: {
      channel: 'Supply',
      priority: 'normal',
      text: 'Food inventory update requested. Report dry ration count and clean water access.'
    }
  },
  {
    label: 'Scout',
    payload: {
      channel: 'Search',
      priority: 'urgent',
           text: 'Scout team forming for perimeter sweep. Confirm battery level and return path.'
    }
  }
];
