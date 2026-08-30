# Capacity evaluation rubric

These are warning guides, not automatic infrastructure actions:

- CPU: watch at 70% sustained, action at 85%, critical at 95%.
- RAM: watch at 70% sustained, action at 85%, critical at 90% or when swap/OOM
  evidence appears.
- Disk: watch at 75% used, action at 85%, critical at 90%. Keep at least 15%
  free for temporary files and database/background work.
- Temporary files: watch when temp usage is over 10% of its filesystem or when
  bounded scanning is incomplete; action when growth is sustained across runs.
- Queues: watch when a queue exceeds its configured expected maximum; action
  when it grows across consecutive samples or jobs are stalled.
- Background jobs: watch on repeated failures/retries or increasing duration;
  action when the queue cannot drain during the observed window.
- Cloud migration requires sustained multi-dimensional pressure or a clear
  availability/concurrency requirement, not one isolated spike.
