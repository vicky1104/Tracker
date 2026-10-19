import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutRectangle,
  type PanResponderInstance,
} from 'react-native';

import { useTheme } from '@/theme/theme';
import { spacing } from '@/theme/tokens';

import { IconButton } from './button';
import { Icon } from './icon';

type DragState = { index: number; target: number } | null;

/**
 * Imperative drag bookkeeping lives outside React state: gesture handlers must
 * stay stable for the whole drag, and row layouts change without re-rendering.
 */
class DragController<T> {
  readonly dy = new Animated.Value(0);
  private layouts: LayoutRectangle[] = [];
  private responders = new Map<number, PanResponderInstance>();
  private drag: DragState = null;
  private items: T[] = [];
  private onReorder: (items: T[]) => void = () => undefined;
  private onDragActive?: (active: boolean) => void;

  constructor(private readonly setDrag: (d: DragState) => void) {}

  update(items: T[], onReorder: (items: T[]) => void, onDragActive?: (active: boolean) => void) {
    this.items = items;
    this.onReorder = onReorder;
    this.onDragActive = onDragActive;
  }

  setLayout(index: number, layout: LayoutRectangle) {
    this.layouts[index] = layout;
  }

  move(from: number, to: number) {
    if (from === to || to < 0 || to >= this.items.length) return;
    const next = [...this.items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.onReorder(next);
  }

  private targetFor(index: number, offset: number): number {
    const own = this.layouts[index];
    if (!own) return index;
    const center = own.y + own.height / 2 + offset;
    let t = 0;
    for (let i = 0; i < this.items.length; i++) {
      const l = this.layouts[i];
      if (i !== index && l && l.y + l.height / 2 < center) t++;
    }
    return t;
  }

  private finish(commit: boolean) {
    const d = this.drag;
    this.drag = null;
    this.dy.setValue(0);
    this.setDrag(null);
    this.onDragActive?.(false);
    if (commit && d) this.move(d.index, d.target);
  }

  handlersFor(index: number) {
    let r = this.responders.get(index);
    if (!r) {
      r = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          this.drag = { index, target: index };
          this.dy.setValue(0);
          this.setDrag(this.drag);
          this.onDragActive?.(true);
        },
        onPanResponderMove: (_, g) => {
          this.dy.setValue(g.dy);
          const t = this.targetFor(index, g.dy);
          if (this.drag && this.drag.target !== t) {
            this.drag = { index, target: t };
            this.setDrag(this.drag);
          }
        },
        onPanResponderRelease: () => this.finish(true),
        onPanResponderTerminate: () => this.finish(false),
      });
      this.responders.set(index, r);
    }
    return r.panHandlers;
  }
}

/**
 * Drag-and-drop reordering built on PanResponder (no native dependency).
 * Every row also has Move up / Move down buttons and screen-reader actions, so
 * reordering never requires a precise drag gesture.
 */
export function ReorderableList<T>({
  items,
  keyOf,
  labelOf,
  renderItem,
  onReorder,
  onDragActive,
}: {
  items: T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onReorder: (items: T[]) => void;
  /** Lets the parent disable scrolling while dragging. */
  onDragActive?: (active: boolean) => void;
}) {
  const { colors } = useTheme();
  const [drag, setDrag] = useState<DragState>(null);
  const [controller] = useState(() => new DragController<T>(setDrag));
  controller.update(items, onReorder, onDragActive);
  useEffect(() => () => onDragActive?.(false), [onDragActive]);

  const dragIndex = drag?.index ?? null;
  const target = drag?.target ?? null;

  return (
    <View>
      {items.map((item, index) => {
        const dragging = dragIndex === index;
        const showIndicatorBefore =
          dragIndex != null && target != null && !dragging && index === (target > dragIndex ? target + 1 : target);
        return (
          <View key={keyOf(item)}>
            {showIndicatorBefore && <View style={[styles.indicator, { backgroundColor: colors.accent }]} />}
            <Animated.View
              onLayout={(e) => controller.setLayout(index, e.nativeEvent.layout)}
              style={[
                styles.row,
                dragging && {
                  transform: [{ translateY: controller.dy }],
                  zIndex: 10,
                  backgroundColor: colors.surface,
                  shadowColor: '#000',
                  shadowOpacity: 0.18,
                  shadowRadius: 10,
                  elevation: 6,
                },
              ]}
              accessibilityActions={[
                { name: 'moveUp', label: 'Move up' },
                { name: 'moveDown', label: 'Move down' },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'moveUp') controller.move(index, index - 1);
                if (e.nativeEvent.actionName === 'moveDown') controller.move(index, index + 1);
              }}>
              <View
                {...controller.handlersFor(index)}
                style={styles.handle}
                accessibilityLabel={`Drag to reorder ${labelOf(item)}`}
                accessibilityHint="Or use the move up and move down actions">
                <Icon name="drag" size={20} color={colors.textTertiary} />
              </View>
              <View style={styles.content}>{renderItem(item)}</View>
              <IconButton icon="up" size={18} label={`Move ${labelOf(item)} up`} disabled={index === 0} onPress={() => controller.move(index, index - 1)} />
              <IconButton
                icon="down"
                size={18}
                label={`Move ${labelOf(item)} down`}
                disabled={index === items.length - 1}
                onPress={() => controller.move(index, index + 1)}
              />
            </Animated.View>
          </View>
        );
      })}
      {dragIndex != null && target === items.length - 1 && dragIndex !== items.length - 1 && (
        <View style={[styles.indicator, { backgroundColor: colors.accent }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  handle: { width: 44, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  indicator: { height: 3, borderRadius: 2, marginHorizontal: spacing.lg },
});
