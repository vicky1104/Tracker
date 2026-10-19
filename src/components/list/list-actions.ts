import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { SheetAction } from '@/components/ui/action-sheet';
import type { useActions } from '@/data/hooks';
import type { HabitList } from '@/domain/types';

/** Shared list menu: edit, archive/restore, delete (with "move habits" option). */
export function listMenuActions(
  list: HabitList,
  allLists: HabitList[],
  habitCount: number,
  actions: ReturnType<typeof useActions>,
  afterDelete?: () => void,
): SheetAction[] {
  const others = allLists.filter((l) => l.id !== list.id && !l.archivedOn);
  const confirmDelete = () => {
    if (habitCount === 0) {
      Alert.alert(`Delete “${list.name}”?`, 'This list has no habits.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void actions.deleteList(list.id, null).then((ok) => ok && afterDelete?.()) },
      ]);
      return;
    }
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: 'Cancel', style: 'cancel' }];
    if (others[0]) {
      buttons.push({
        text: `Move habits to “${others[0].name}”`,
        onPress: () => void actions.deleteList(list.id, others[0].id).then((ok) => ok && afterDelete?.()),
      });
    }
    buttons.push({
      text: 'Delete list and habits',
      style: 'destructive',
      onPress: () => void actions.deleteList(list.id, null).then((ok) => ok && afterDelete?.()),
    });
    Alert.alert(
      `Delete “${list.name}”?`,
      `It contains ${habitCount} habit${habitCount === 1 ? '' : 's'}. Moving them keeps all their history.`,
      buttons,
    );
  };

  return [
    { label: 'Edit list', icon: 'edit', onPress: () => router.push({ pathname: '/list/edit', params: { id: list.id } }) },
    { label: 'Add habit to this list', icon: 'add', onPress: () => router.push({ pathname: '/habit/edit', params: { listId: list.id } }) },
    list.archivedOn
      ? { label: 'Restore list', icon: 'unarchive', onPress: () => void actions.restoreList(list.id) }
      : { label: 'Archive list', icon: 'archive', onPress: () => void actions.archiveList(list.id) },
    { label: 'Delete list', icon: 'delete', destructive: true, onPress: confirmDelete },
  ];
}
