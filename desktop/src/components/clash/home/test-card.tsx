import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { Add, NetworkCheck } from '@mui/icons-material'
import { Box, IconButton, Tooltip, alpha, styled, Grid } from '@mui/material'
import { emit } from '@tauri-apps/api/event'
import { nanoid } from 'nanoid'
import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { TestItem } from '@/components/clash/test/test-item'
import { TestViewer, TestViewerRef } from '@/components/clash/test/test-viewer'
import { useVerge } from '@/hooks/clash/use-verge'
import {
  clashAppleTestIconSvg,
  clashGithubTestIconSvg,
  clashGoogleTestIconSvg,
  clashYoutubeTestIconSvg,
} from '@/icons/AllIcons'

import { EnhancedCard } from './enhanced-card'

const ScrollBox = styled(Box)(({ theme }) => ({
  maxHeight: '180px',
  overflowY: 'auto',
  overflowX: 'hidden',
  '&::-webkit-scrollbar': {
    width: '6px',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.text.primary, 0.2),
    borderRadius: '3px',
  },
}))

const DEFAULT_TEST_LIST = [
  {
    uid: nanoid(),
    name: 'Apple',
    url: 'https://www.apple.com',
    icon: clashAppleTestIconSvg,
  },
  {
    uid: nanoid(),
    name: 'GitHub',
    url: 'https://www.github.com',
    icon: clashGithubTestIconSvg,
  },
  {
    uid: nanoid(),
    name: 'Google',
    url: 'https://www.google.com',
    icon: clashGoogleTestIconSvg,
  },
  {
    uid: nanoid(),
    name: 'YouTube',
    url: 'https://www.youtube.com',
    icon: clashYoutubeTestIconSvg,
  },
]

export const TestCard = () => {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )
  const { verge, mutateVerge, patchVerge } = useVerge()
  const viewerRef = useRef<TestViewerRef>(null)

  const testList = useMemo(() => {
    return verge?.test_list ?? DEFAULT_TEST_LIST
  }, [verge?.test_list])

  const onTestListItemChange = useCallback(
    (uid: string, patch?: Partial<IVergeTestItem>) => {
      if (!patch) {
        mutateVerge()
        return
      }

      const newList = testList.map((x) =>
        x.uid === uid ? { ...x, ...patch } : x,
      )

      mutateVerge({ ...verge, test_list: newList }, false)
    },
    [testList, verge, mutateVerge],
  )

  const onDeleteTestListItem = useCallback(
    (uid: string) => {
      const newList = testList.filter((x) => x.uid !== uid)
      patchVerge({ test_list: newList })
      mutateVerge({ ...verge, test_list: newList }, false)
    },
    [testList, verge, patchVerge, mutateVerge],
  )

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const old_index = testList.findIndex((x) => x.uid === active.id)
      const new_index = testList.findIndex((x) => x.uid === over.id)

      if (old_index >= 0 && new_index >= 0) {
        const newList = [...testList]
        const [removed] = newList.splice(old_index, 1)
        newList.splice(new_index, 0, removed)

        mutateVerge({ ...verge, test_list: newList }, false)
        const patchFn = () => {
          try {
            patchVerge({ test_list: newList })
          } catch {}
        }
        if (window.requestIdleCallback) {
          window.requestIdleCallback(patchFn)
        } else {
          setTimeout(patchFn, 0)
        }
      }
    },
    [testList, verge, mutateVerge, patchVerge],
  )

  useEffect(() => {
    if (verge && !verge.test_list) {
      patchVerge({ test_list: DEFAULT_TEST_LIST })
    }
  }, [verge, patchVerge])

  const renderTestItems = useMemo(
    () => (
      <Grid container spacing={1} columns={12}>
        <SortableContext items={testList.map((x) => x.uid)}>
          {testList.map((item) => (
            <Grid key={item.uid} size={3}>
              <TestItem
                id={item.uid}
                itemData={item}
                onEdit={() => viewerRef.current?.edit(item)}
                onDelete={onDeleteTestListItem}
              />
            </Grid>
          ))}
        </SortableContext>
      </Grid>
    ),
    [testList, onDeleteTestListItem],
  )

  const handleTestAll = useCallback(() => {
    emit('verge://test-all')
  }, [])

  const handleCreateTest = useCallback(() => {
    viewerRef.current?.create()
  }, [])

  return (
    <EnhancedCard
      title={t('home.components.tests.title')}
      icon={<NetworkCheck />}
      action={
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('tests.page.actions.testAll')} arrow>
            <IconButton size="small" onClick={handleTestAll}>
              <NetworkCheck fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('tests.modals.test.title.create')} arrow>
            <IconButton size="small" onClick={handleCreateTest}>
              <Add fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      }
    >
      <ScrollBox>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          {renderTestItems}
          <DragOverlay />
        </DndContext>
      </ScrollBox>

      <TestViewer ref={viewerRef} onChange={onTestListItemChange} />
    </EnhancedCard>
  )
}
