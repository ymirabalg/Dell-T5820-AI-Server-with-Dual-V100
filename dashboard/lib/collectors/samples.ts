/**
 * Fixture **text** for the step-3 collectors — the bytes their parsers actually see.
 *
 * Two kinds live here, and the difference is stated per constant:
 *
 * 1. **`CAPTURED_*` — literal output from `ai-server`, taken 2026-09-06 over SSH.**
 *    Read-only commands only (invariant 2): `cat` on the `/proc` and `/sys` paths §2.2
 *    bind-mounts, and one `nvidia-smi --query-gpu` with the exact §3.1 field list. Nothing
 *    was reformatted, so the two-space gap after `cpu` in `/proc/stat`, the interface name
 *    padded against its colon in `/proc/net/dev`, the `[N/A]` placeholder and the trailing
 *    newlines are all the machine's own. Where a parser has to survive noise — the 2 KB
 *    `intr` line, twelve `/proc/cpuinfo` blocks — the noise is genuinely there.
 *
 * 2. **Hand-built failure fixtures.** The box is healthy, so the states this dashboard
 *    exists to render honestly cannot be captured from it: `nvidia-smi` absent, a card
 *    that disappears between polls, a truncated file, a column that will not parse. Each
 *    is derived from the captured text by one named mutation, so it differs from reality
 *    in exactly the way its name says and in no other way.
 *
 * ⚠ Distinct from `lib/fixtures.ts`, which holds canonical *snapshots* — the far end of
 * the pipeline. HANDOVER §6: "Step 3 should extend the fixture set with real `nvidia-smi`
 * and `/proc` **text**, not with more snapshots." This is that text.
 *
 * ⚠ **This file is `samples.ts`, not `fixtures.ts`, and the name is deliberate.** It was
 * renamed during step 3's reconciliation because steps 4 and 5 need *both* files in one
 * test — `lib/fixtures.ts` for a canonical snapshot and this one for raw text — and
 * `from './fixtures'` beside `from '../fixtures'` is two imports one character apart
 * resolving to different modules. Add raw text here; add snapshot values to
 * `lib/fixtures.ts`. Do not reintroduce the collision.
 *
 * Test data only. Nothing under `app/` imports this file.
 */

/**
 * `/proc/stat`, verbatim. §3.2's source for `cpuPct`.
 *
 * Three things here are worth a parser's attention and all three are real:
 * the aggregate line is `cpu` followed by **two** spaces; the twelve `cpuN` lines that
 * follow must not be mistaken for it; and the `intr` line runs to about 2 KB of mostly
 * zeros, so a parser that scans the whole file rather than stopping at the first line is
 * doing avoidable work on every poll.
 *
 * Aggregate: `user 624650, nice 1415, system 556005, idle 96222283, iowait 35342, irq 0,
 * softirq 55034, steal 0` — then `guest 0` and `guest_nice 0`, which are already counted
 * inside `user` and `nice` and must not be added again.
 */
export const CAPTURED_PROC_STAT = `cpu  624650 1415 556005 96222283 35342 0 55034 0 0 0
cpu0 22031 0 36133 8058332 3733 0 491 0 0 0
cpu1 56706 0 60875 7918031 3195 0 54290 0 0 0
cpu2 90461 44 59408 7968162 2987 0 88 0 0 0
cpu3 70519 4 59775 7991176 2492 0 26 0 0 0
cpu4 51186 281 60217 8011088 2992 0 22 0 0 0
cpu5 77872 0 51862 7995997 2250 0 19 0 0 0
cpu6 24827 0 43374 8057673 3047 0 14 0 0 0
cpu7 28873 12 35348 8062002 2929 0 15 0 0 0
cpu8 43882 4 34206 8048956 3579 0 15 0 0 0
cpu9 69969 0 39847 8018197 2828 0 17 0 0 0
cpu10 29492 919 35515 8062512 2706 0 13 0 0 0
cpu11 58827 147 39441 8030151 2598 0 19 0 0 0
intr 113833024 48 9 0 0 0 0 0 0 0 0 0 0 0 0 0 0 8 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 198910 0 0 0 0 0 0 0 0 64678325 0 668 0 667 169814 209439 42133 164192 204539 203040 125377 203415 77749 268842 186201 228110 13885 6144 6758 4420 4686 5533 4112 6746 5221 3168 5232 3998 0 0 0 2 0 2 2 2 68 2 2 2 2 288 43804 40223 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
ctxt 89373729
btime 1788650824
processes 724477
procs_running 1
procs_blocked 0
softirq 103587244 6 7100602 375 64673983 1362 0 199413 18907649 1205021 11498833
`;

/**
 * `/proc/meminfo`, verbatim. §3.2: `memUsed = MemTotal - MemAvailable`.
 *
 * `MemTotal: 64197644 kB` is the 61 GiB CLAUDE.md records (64197644 / 1048576 = 61.22).
 * `SwapTotal: 8388604 kB` is the 8 GiB. Swap in use is 22356 kB = **0.0213 GiB**, which
 * §6.6 renders at 2 dp as `0.02 GiB` precisely so it does not round to `0.0` — "any swap
 * in use is notable on this box".
 *
 * Note the unit column says `kB` while the kernel means KiB. The parser requires that
 * exact suffix rather than assuming it: a value in some other unit read as KiB would be
 * wrong by 1024x and would still look entirely plausible.
 */
export const CAPTURED_PROC_MEMINFO = `MemTotal:       64197644 kB
MemFree:         8280408 kB
MemAvailable:   58353620 kB
Buffers:           23060 kB
Cached:         50699660 kB
SwapCached:         4040 kB
Active:         17177616 kB
Inactive:       37309044 kB
Active(anon):    3688688 kB
Inactive(anon):   414932 kB
Active(file):   13488928 kB
Inactive(file): 36894112 kB
Unevictable:        8384 kB
Mlocked:            8384 kB
SwapTotal:       8388604 kB
SwapFree:        8366248 kB
Zswap:                 0 kB
Zswapped:              0 kB
Dirty:               876 kB
Writeback:             0 kB
AnonPages:       3770440 kB
Mapped:          1426352 kB
Shmem:            333448 kB
KReclaimable:     411568 kB
Slab:             624116 kB
SReclaimable:     411568 kB
SUnreclaim:       212548 kB
KernelStack:        5040 kB
PageTables:        17476 kB
SecPageTables:      7480 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:    40487424 kB
Committed_AS:    6011792 kB
VmallocTotal:   34359738367 kB
VmallocUsed:      201700 kB
VmallocChunk:          0 kB
Percpu:            18048 kB
HardwareCorrupted:     0 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
FileHugePages:         0 kB
FilePmdMapped:         0 kB
CmaTotal:              0 kB
CmaFree:               0 kB
Unaccepted:            0 kB
Balloon:               0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
Hugetlb:               0 kB
DirectMap4k:     1978028 kB
DirectMap2M:    49065984 kB
DirectMap1G:    15728640 kB
`;

/**
 * `/proc/loadavg`, verbatim. §3.2 wants the first three fields; the running/total process
 * count and the last PID are ignored.
 */
export const CAPTURED_PROC_LOADAVG = `0.34 0.19 0.08 1/304 724578
`;

/**
 * `/proc/uptime`, verbatim. The first field is uptime in seconds; the second is aggregate
 * idle time across all CPUs and is not used. 81376.01 s is `up 22:36`.
 */
export const CAPTURED_PROC_UPTIME = `81376.01 962236.57
`;

/**
 * `/proc/net/dev`, verbatim. §3.5's `eno1` byte counters.
 *
 * ⚠ The classic trap is visible in the header: names are **right-aligned in a fixed-width
 * column and terminated by a colon**, so a long interface name leaves no space before its
 * first value (`enp0s31f6:65734369014`). Splitting the line on whitespace and taking field
 * 1 as the interface works here and silently produces a wrong number there. Split on the
 * first colon.
 *
 * Sixteen values follow: eight receive (bytes packets errs drop fifo frame compressed
 * multicast) then eight transmit (bytes packets errs drop fifo colls carrier compressed).
 * The two the dashboard wants are the first of each — offsets 0 and 8.
 */
export const CAPTURED_PROC_NET_DEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  327140    2591    0    0    0     0          0         0   327140    2591    0    0    0     0       0          0
  eno1: 65734369014 43716435    0 181828    0     0          0     89083 1562741756 21488214    0    1    0     0       0          0
`;

/**
 * `/proc/cpuinfo`, verbatim — all twelve blocks, flags included. §3.2's `cpuModel`,
 * `cores` and `threads`.
 *
 * Kept whole rather than trimmed to a block or two, because the counts are the point:
 * twelve `processor` lines is `threads`, and six distinct `physical id`+`core id` pairs is
 * `cores`. A truncated fixture would assert 6/12 against a file that could not produce
 * them, which is the "test that looks like coverage and is not" this step was warned about.
 *
 * `model name` is `Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz`, carried raw — §3.2 trims it to
 * `Xeon W-2135` **for display**, which makes the trimming `lib/format.ts`'s job. A
 * snapshot that has already discarded the text cannot be un-trimmed.
 */
export const CAPTURED_PROC_CPUINFO = `processor	: 0
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 0
cpu cores	: 6
apicid		: 0
initial apicid	: 0
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 1
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1201.016
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 1
cpu cores	: 6
apicid		: 2
initial apicid	: 2
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 2
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.246
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 2
cpu cores	: 6
apicid		: 4
initial apicid	: 4
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 3
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 3
cpu cores	: 6
apicid		: 6
initial apicid	: 6
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 4
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 4
cpu cores	: 6
apicid		: 8
initial apicid	: 8
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 5
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 5
cpu cores	: 6
apicid		: 10
initial apicid	: 10
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 6
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 0
cpu cores	: 6
apicid		: 1
initial apicid	: 1
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 7
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.085
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 1
cpu cores	: 6
apicid		: 3
initial apicid	: 3
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 8
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1199.988
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 2
cpu cores	: 6
apicid		: 5
initial apicid	: 5
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 9
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.000
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 3
cpu cores	: 6
apicid		: 7
initial apicid	: 7
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 10
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1428.905
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 4
cpu cores	: 6
apicid		: 9
initial apicid	: 9
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

processor	: 11
vendor_id	: GenuineIntel
cpu family	: 6
model		: 85
model name	: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz
stepping	: 4
microcode	: 0x2007006
cpu MHz		: 1200.183
cache size	: 8448 KB
physical id	: 0
siblings	: 12
core id		: 5
cpu cores	: 6
apicid		: 11
initial apicid	: 11
fpu		: yes
fpu_exception	: yes
cpuid level	: 22
wp		: yes
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush dts acpi mmx fxsr sse sse2 ss ht tm pbe syscall nx pdpe1gb rdtscp lm constant_tsc art arch_perfmon pebs bts rep_good nopl xtopology nonstop_tsc cpuid aperfmperf pni pclmulqdq dtes64 monitor ds_cpl vmx smx est tm2 ssse3 sdbg fma cx16 xtpr pdcm pcid dca sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand lahf_lm abm 3dnowprefetch cpuid_fault epb cat_l3 cdp_l3 pti intel_ppin ssbd mba ibrs ibpb stibp tpr_shadow flexpriority ept vpid ept_ad fsgsbase tsc_adjust bmi1 hle avx2 smep bmi2 erms invpcid rtm cqm mpx rdt_a avx512f avx512dq rdseed adx smap clflushopt clwb intel_pt avx512cd avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves cqm_llc cqm_occup_llc cqm_mbm_total cqm_mbm_local dtherm ida arat pln pts hwp hwp_act_window hwp_epp hwp_pkg_req vnmi md_clear flush_l1d arch_capabilities
vmx flags	: vnmi preemption_timer posted_intr invvpid ept_x_only ept_ad ept_1gb flexpriority apicv tsc_offset vtpr mtf vapic ept vpid unrestricted_guest vapic_reg vid ple shadow_vmcs pml ept_violation_ve ept_mode_based_exec tsc_scaling
bugs		: cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs taa itlb_multihit mmio_stale_data retbleed gds spectre_v2_user vmscape
bogomips	: 7399.70
clflush size	: 64
cache_alignment	: 64
address sizes	: 46 bits physical, 48 bits virtual
power management:

`;

/**
 * `/proc/version`, verbatim. Kept as evidence of what the file looks like; the collector
 * reads the kernel release from `uname` instead, which §3.2 explicitly permits — see the
 * note on `unameRelease` in `io.ts` for why.
 */
export const CAPTURED_PROC_VERSION = `Linux version 7.0.0-30-generic (buildd@lcy02-amd64-048) (x86_64-linux-gnu-gcc (Ubuntu 15.2.0-16ubuntu1) 15.2.0, GNU ld (GNU Binutils for Ubuntu) 2.46) #30-Ubuntu SMP PREEMPT_DYNAMIC Fri Jul 31 18:22:54 UTC 2026
`;

/**
 * `/etc/hostname`, verbatim — one line and a newline.
 *
 * §3.2: this file, bind-mounted read-only, and **never `os.hostname()`**. `--network host`
 * shares the network namespace; the hostname lives in the UTS namespace, so `os.hostname()`
 * would return the container id and §6.2's header would show it without any error to
 * explain the change.
 */
export const CAPTURED_ETC_HOSTNAME = `ai-server
`;

/** `/sys/class/net/eno1/operstate`, verbatim. One of §3.7's seven `LinkState` values. */
export const CAPTURED_OPERSTATE = `up
`;

/**
 * `nvidia-smi --query-gpu=<§3.1's eleven fields> --format=csv,noheader,nounits`, verbatim,
 * both V100s idle.
 *
 * Three things differ from what §3.1's examples suggest, and all three are the driver's
 * doing rather than a capture artefact (NVIDIA-SMI 580.173.02):
 *
 * - `pci.bus_id` is the **full domain form** `00000000:97:00.0`, not §3.1's `97:00.0`.
 *   Carried raw; see `nvidia-smi.ts`.
 * - `name` is `Tesla PG500-216`, the board id, not §3.1's `Tesla V100-PCIE-32GB`. §9 says
 *   the card's identity is read at runtime and never assumed, and this is why.
 * - `clocks_throttle_reasons.active` and `clocks_event_reasons.active` are **accepted
 *   aliases on driver 580, returning identical values** (§3.1) — not a rename in progress.
 *   The newer spelling is what appears in the CSV header, which `noheader` suppresses.
 *   Recorded so the difference is recognised rather than debugged, and so no later step
 *   "fixes" a field name that is already correct.
 *
 * `memory.used` 26456 / 26650 MiB against 32768 matches CLAUDE.md's commissioned
 * 128K-context figures, so this row is the live serving configuration and not a lab value.
 */
export const CAPTURED_NVIDIA_SMI = `0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0000000000000000
1, Tesla PG500-216, 00000000:97:00.0, 39, 39.61, 250.00, 26650, 32768, 0, 1260, 0x0000000000000000
`;


// ---------------------------------------------------------------------------
// Hand-built failure fixtures
//
// The box is healthy. Every state below is one this dashboard exists to render honestly
// and none of them can be captured from a working machine, so each is the captured text
// above with one named mutation applied.
// ---------------------------------------------------------------------------

/**
 * `nvidia-smi` ran and enumerated nothing. §4/HANDOVER: this is `gpus: []`, which is **not**
 * `gpus: null` — "`[]` means the enumeration ran and found nothing", a state this box was
 * genuinely in for weeks.
 *
 * Doubles as the empty-file case for every `/proc` parser: the same zero bytes that
 * `Number('')` turns into `0`.
 */
export const EMPTY = '';

/** A file that stops mid-line — a partial read, or a `/proc` file racing a writer. */
export const NVIDIA_SMI_TRUNCATED_ROW =
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 264';

/**
 * **A card that disappeared between polls.** GPU 1 is gone; GPU 0 is byte-identical to its
 * captured row.
 *
 * The failure this guards against is a collector that keys GPUs by array position: poll N
 * has two cards, poll N+1 has one, and index 1's readings must vanish rather than being
 * silently attributed to index 0.
 */
export const NVIDIA_SMI_ONE_CARD =
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0000000000000000\n';

/**
 * Columns present but unreadable. `[N/A]` is the real placeholder — confirmed on this box
 * by querying `fan.speed` on a passively-cooled V100 — and `[Unknown Error]` is the form
 * NVML uses when a query fails on an otherwise-live card.
 *
 * The whole row is placeholders so that it pairs exactly with {@link NVIDIA_SMI_ALL_ZERO}:
 * same eleven columns, one all-`null`, one none-`null`. That pairing is invariant 1 for
 * this parser, the way `nothingReadable` and `everythingZero` are for `lib/fixtures.ts`.
 *
 * Every one of these must become `null`. `Number('[N/A]')` is `NaN`, which a brand
 * constructor would happily carry (HANDOVER §3: they name a unit, they do not validate
 * one), and `celsius(NaN)` renders as `—` only by the formatter's finiteness guard —
 * a guard §6.6 documents as a backstop and not as the contract.
 */
export const NVIDIA_SMI_NA_COLUMNS =
  '0, [N/A], [N/A], [N/A], [Unknown Error], [N/A], [N/A], [Not Supported], [N/A], [N/A], [N/A]\n';

/**
 * A row whose `index` will not parse. `lib/types.ts`: `index` is the row's identity and
 * §6.2 joins the SERVING panel onto the GPU card by it, so "a row whose index did not
 * parse cannot be placed in a panel at all and is not a GPU — it is an `errors[]` entry".
 */
export const NVIDIA_SMI_BAD_INDEX =
  'GPU-0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0\n';

/** A row with the wrong number of columns — a driver that answered a shorter field list. */
export const NVIDIA_SMI_SHORT_ROW = '0, Tesla PG500-216, 00000000:17:00.0, 38\n';

/**
 * ⚠ **The other side of the column-count boundary: TWELVE columns.**
 *
 * Every column-count fixture in this step used to be a *short* row, so weakening the guard
 * from `!==` to `<` passed all 807 tests and all 51 mutations. That is the fixture-symmetry
 * rule this step adopted: **every boundary guard needs a fixture on both sides of it.**
 *
 * The extra column comes from a comma *inside* a cell — a quoted board name — which is the
 * worse of the two ways to reach twelve, because it shifts **every** field one place left
 * with `problems: []` to explain it. Measured under the weakened guard:
 *
 * ```
 * name "\"Tesla V100"   bus "PCIE\""   tempC null
 * powerW 38             <- the TEMPERATURE
 * memTotalMiB 26456     <- the USED figure, on a 32,768 MiB card
 * utilPct 32768         <- the TOTAL
 * throttleReasons "1260" -> 0x20 sw thermal slowdown | 0x40 hw thermal slowdown
 * ```
 *
 * A card at 38 °C reported as thermally throttling. This driver quotes nothing and no
 * NVIDIA board name carries a comma, so the shipped equality guard is correct today and
 * this fixture pins it against a refactor rather than against the driver.
 */
export const NVIDIA_SMI_WIDE_ROW =
  '0, "Tesla V100, PCIE", 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0\n';

/**
 * `utilization.gpu` outside 0–100, on both sides. §3.1 range-checks this field and **only**
 * this one: 0–100 *is* the unit of a percentage, so the bound is not invented — unlike a
 * bound on temperature or power, which would risk discarding a real reading.
 *
 * The pair exists for the same reason as {@link NVIDIA_SMI_WIDE_ROW}: a range check tested
 * on one side only is a `>` that could have been a `>=` with nothing to say so.
 */
export const NVIDIA_SMI_UTIL_OVER_RANGE =
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 101, 1260, 0x0\n';
export const NVIDIA_SMI_UTIL_UNDER_RANGE =
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, -1, 1260, 0x0\n';
/** The boundary itself, from both directions — both are readings and neither is `null`. */
export const NVIDIA_SMI_UTIL_AT_BOUNDS =
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0\n' +
  '1, Tesla PG500-216, 00000000:97:00.0, 39, 39.61, 250.00, 26650, 32768, 100, 1260, 0x0\n';

/**
 * A good row preceded by a driver warning on **stdout**. `nvidia-smi` usually writes these
 * to stderr, but not always, and a parser that treats every line as a row would turn the
 * banner into a phantom GPU.
 */
export const NVIDIA_SMI_WITH_BANNER =
  'WARNING: infoROM is corrupted at gpu 0000:17:00.0\n' +
  '0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0000000000000000\n';

/**
 * A genuinely idle, genuinely empty card: every reading is `0`, and every one of them is a
 * *reading*. The counterpart to {@link NVIDIA_SMI_NA_COLUMNS}, and together they are
 * invariant 1 for this parser — same eleven columns, one all-`null`, one none-`null`.
 */
export const NVIDIA_SMI_ALL_ZERO =
  '0, Tesla PG500-216, 00000000:17:00.0, 0, 0.00, 0.00, 0, 0, 0, 0, 0x0\n';

/** `/proc/stat` cut off inside the aggregate line's first value. */
export const PROC_STAT_TRUNCATED = 'cpu  6246';

/** `/proc/stat` with a non-numeric field where a jiffy count belongs. */
export const PROC_STAT_CORRUPT = 'cpu  624650 1415 xxxxxx 96222283 35342 0 55034 0 0 0\n';

/**
 * `/proc/stat` with only the per-core lines — the aggregate `cpu` line is missing. A
 * parser that matched `cpu` as a prefix would read `cpu0` as the total.
 */
export const PROC_STAT_NO_AGGREGATE =
  'cpu0 21997 0 36060 8032667 3733 0 491 0 0 0\ncpu1 56616 0 60701 7892526 3195 0 54289 0 0 0\n';

/**
 * `/proc/meminfo` without `MemAvailable` (kernels before 3.14).
 *
 * `memTotalGiB` still reads; `memUsedGiB` is `null`, because §3.2's derivation needs both.
 * Falling back to `MemTotal - MemFree` would report 56 GiB used on a box using 5.6 — page
 * cache counted as consumption — and it would look entirely plausible.
 */
export const PROC_MEMINFO_NO_MEMAVAILABLE =
  'MemTotal:       64197644 kB\nMemFree:         8280408 kB\nBuffers:           23060 kB\n' +
  'Cached:         50699660 kB\nSwapTotal:       8388604 kB\nSwapFree:        8366248 kB\n';

/**
 * `/proc/meminfo` with an empty value and a wrong unit.
 *
 * `MemTotal:` with nothing after it is where `Number('')` returns `0` and the RAM meter
 * reads `0.0 / 0.0 GiB`; `SwapTotal: 8388604 B` is where a unit read as KiB would be
 * wrong by 1024x. Both must be `null`.
 */
export const PROC_MEMINFO_BAD_VALUES =
  'MemTotal:           kB\nMemAvailable:   58353620 kB\nSwapTotal:       8388604 B\nSwapFree:        8366248 kB\n';

/** `/proc/net/dev` with the header rows but no `eno1` — the interface was renamed or removed. */
export const PROC_NET_DEV_NO_ENO1 =
  'Inter-|   Receive                                                |  Transmit\n' +
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
  '    lo:  327140    2591    0    0    0     0          0         0   327140    2591    0    0    0     0       0          0\n';

/**
 * `/proc/net/dev` where the interface name is long enough that its first value is jammed
 * against the colon — the predictable-name form of `eno1` on many Ubuntu installs.
 *
 * A whitespace split reads the interface as `enp0s31f6:65734143147` and the rx bytes as
 * the packet count. Splitting on the first colon reads both correctly.
 */
export const PROC_NET_DEV_JAMMED =
  'Inter-|   Receive                                                |  Transmit\n' +
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
  'enp0s31f6:65734369014 43716435    0 181828    0     0          0     89083 1562741756 21488214    0    1    0     0       0          0\n';

/**
 * ⚠ **The other side of the sixteen-column boundary: SEVENTEEN.** A future kernel adding a
 * per-interface counter is the realistic route here.
 *
 * The fixture-symmetry rule again — every column-count fixture in this step was a *short*
 * line, so `!==` weakened to `<` survived the whole suite. This one is **milder** than
 * {@link NVIDIA_SMI_WIDE_ROW} and the difference is worth knowing: rx and tx sit at fixed
 * offsets from the *left* and an extra column appends, so under the weakened guard the two
 * byte counters still came back correct. Nothing shifts and nothing is fabricated. It is a
 * fixture for symmetry, not for a live hazard — and the *reason* it is safe is a property
 * of this file's layout, which is exactly the kind of reasoning that should be pinned
 * rather than re-derived.
 */
export const PROC_NET_DEV_WIDE =
  'Inter-|   Receive                                                |  Transmit\n' +
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n' +
  '  eno1: 65734369014 43716435    0 181828    0     0          0     89083 1562741756 21488214    0    1    0     0       0          0    999\n';

/**
 * `/proc/cpuinfo` from a machine that reports no topology — no `physical id`, no `core id`.
 * `threads` still counts, `cores` is `null` rather than being guessed from `cpu cores`.
 */
export const PROC_CPUINFO_NO_TOPOLOGY =
  'processor\t: 0\nmodel name\t: Some CPU\n\nprocessor\t: 1\nmodel name\t: Some CPU\n';

/**
 * The `coretemp` hwmon directory as the box really reports it, keyed by filename.
 *
 * §3.2 names `Package id 0` as the CPU sensor, and the reason it must be found by **label**
 * rather than by index is right here: `temp1` happens to be the package on this board, but
 * `temp2`–`temp7` are the six cores and nothing in sysfs promises that ordering. Values are
 * millidegrees — 31000 is 31 °C.
 *
 * ⚠ Not `dell_smm`'s `temp1`, which §3.2 measured swinging 43–54 °C while the package held
 * 35–37 °C.
 */
export const CAPTURED_CORETEMP: Readonly<Record<string, string>> = {
  temp1_label: 'Package id 0\n',
  temp2_label: 'Core 0\n',
  temp3_label: 'Core 1\n',
  temp4_label: 'Core 2\n',
  temp5_label: 'Core 3\n',
  temp6_label: 'Core 4\n',
  temp7_label: 'Core 5\n',
  temp1_input: '31000\n',
  temp2_input: '30000\n',
  temp3_input: '30000\n',
  temp4_input: '30000\n',
  temp5_input: '31000\n',
  temp6_input: '30000\n',
  temp7_input: '30000\n',
};

/**
 * A `coretemp` node whose package `temp1_input` reads empty — the file exists, the read
 * returned nothing.
 *
 * This is HANDOVER O6's trap in its CPU-temperature form: `Number('')` is `0`, and `0 °C`
 * on a Xeon is both perfectly formattable and completely false. It must be `null`.
 */
export const CORETEMP_EMPTY_INPUT: Readonly<Record<string, string>> = {
  temp1_label: 'Package id 0\n',
  temp1_input: '\n',
};

/** A `coretemp` node with only per-core sensors — no `Package id 0` label anywhere. */
export const CORETEMP_NO_PACKAGE: Readonly<Record<string, string>> = {
  temp1_label: 'Core 0\n',
  temp1_input: '30000\n',
};

// ---------------------------------------------------------------------------
// §3.3 `dell_smm` — step 4
// ---------------------------------------------------------------------------

/**
 * The `dell_smm` hwmon directory listing, **verbatim from `ai-server` 2026-09-06**.
 *
 * This is the 5-fan DKMS module loaded and working: `fan5_*` and `pwm5` are here, which on
 * the stock in-tree driver they are not (`DELL_SMM_NO_FANS = 4`). Compare
 * {@link DELL_SMM_STOCK_ENTRIES}.
 *
 * ⚠ Three of these files are the §3.3 traps and **nothing in this project reads them**:
 * `pwmN_enable` (reads `2`, "EC auto", even under manual control), `fanN_target` (clamps to
 * the HIGH nominal), and `fanN_label` (returns `EINVAL` on this board — `GET_FAN_TYPE`
 * fails). They are kept in the listing precisely so a test can assert they were not read.
 */
export const CAPTURED_DELL_SMM_ENTRIES: readonly string[] = [
  'device',
  'fan1_input',
  'fan1_label',
  'fan1_max',
  'fan1_min',
  'fan1_target',
  'fan2_input',
  'fan2_label',
  'fan2_max',
  'fan2_min',
  'fan2_target',
  'fan3_input',
  'fan3_label',
  'fan3_max',
  'fan3_min',
  'fan3_target',
  'fan4_input',
  'fan4_label',
  'fan4_max',
  'fan4_min',
  'fan4_target',
  'fan5_input',
  'fan5_label',
  'fan5_max',
  'fan5_min',
  'fan5_target',
  'name',
  'power',
  'pwm1',
  'pwm1_enable',
  'pwm2',
  'pwm2_enable',
  'pwm3',
  'pwm3_enable',
  'pwm4',
  'pwm4_enable',
  'pwm5',
  'pwm5_enable',
  'subsystem',
  'temp1_input',
  'temp2_input',
  'temp5_input',
  'temp7_input',
  'uevent',
];

/**
 * The readable files of that node, **verbatim, one atomic capture 2026-09-06**.
 *
 * Both V100s were at 40 °C — below `gpu-fan-control`'s `AUTO_BELOW=55`, so the service had
 * handed channel 5 back to the EC, and `fan5_input` reads the EC's own idle duty rather
 * than the ~4300 RPM of an engaged HIGH. That is why the companion `pwm5` capture is a
 * **rejection** and not a number: see {@link PWM5_EC_AUTO}.
 *
 * ⚠ `pwm5` is not a key here, and cannot be: it did not produce bytes. `ENODATA` is an
 * outcome of the *read*, which is why §3.7's probe cannot be modelled as a
 * `filename → contents` record alone.
 */
export const CAPTURED_DELL_SMM: Readonly<Record<string, string>> = {
  name: 'dell_smm\n',
  fan1_input: '1028\n',
  fan2_input: '718\n',
  fan3_input: '615\n',
  fan4_input: '1006\n',
  fan5_input: '1915\n',
};

/**
 * The three §3.3 trap files as the box really answers them, captured the same moment.
 *
 * Kept as evidence, not as input: **no code reads any of them.** `pwm5_enable` says `2`
 * ("EC auto") — which happens to be true right now but is *also* what it says under manual
 * control, so it is worthless either way — and `fan5_target` says `5100`, the HIGH
 * nominal, while `fan5_input` was reading 1915.
 */
export const CAPTURED_DELL_SMM_TRAPS: Readonly<Record<string, string>> = {
  pwm5_enable: '2\n',
  fan5_target: '5100\n',
  fan5_max: '5100\n',
};

/**
 * The stock in-tree driver's listing: `DELL_SMM_NO_FANS = 4`, so there is **no `fan5_*` and
 * no `pwm5`** no matter what is plugged into `FAN_HDD`.
 *
 * This is §3.6's alarm — the DKMS 5-fan module did not load and GPU fan control is gone —
 * and it is the state `lib/fixtures.ts`'s `pwm5NodeAbsent` encodes. It cannot be captured
 * from the box, which is healthy; it is the captured listing with the five `fan5_*` names
 * and `pwm5` removed, and nothing else changed.
 */
export const DELL_SMM_STOCK_ENTRIES: readonly string[] = CAPTURED_DELL_SMM_ENTRIES.filter(
  (entry) => !entry.startsWith('fan5_') && entry !== 'pwm5',
);

/** The same node's readable files with `fan5_input` gone. Channels 1–4 survive (§9). */
export const DELL_SMM_STOCK: Readonly<Record<string, string>> = {
  name: 'dell_smm\n',
  fan1_input: '1028\n',
  fan2_input: '718\n',
  fan3_input: '615\n',
  fan4_input: '1006\n',
};

/**
 * `fan5_input` reading **zero** — a dead fan on the GPU/PCIe header.
 *
 * ⚠ Global invariant 1's whole point, and the one that costs the most on this box: this is
 * `rpm(0)` and renders `0 RPM`. It is **not** `null`, which is what a driver that did not
 * load looks like. Pair with {@link DELL_SMM_FAN5_EMPTY}, which is the same file producing
 * nothing.
 */
export const DELL_SMM_FAN5_STALLED = '0\n';

/**
 * `fan5_input` reading **14451** — the tach that hung POST (repo `CLAUDE.md`, 2026-08-15).
 *
 * §6.3's absolute row makes anything over the 5100 nominal an alarm, so this must reach the
 * contract **as a reading**. A collector that "sanity-checked" it into `null` would replace
 * the early warning with an em dash.
 */
export const DELL_SMM_FAN5_IMPLAUSIBLE = '14451\n';

/** 5100 exactly — the SMM nominal max, and §6.3's boundary. Normal, not an alarm. */
export const DELL_SMM_FAN5_AT_NOMINAL = '5100\n';

/** One above it. The other side of the same boundary (HANDOVER §5's fixture rule). */
export const DELL_SMM_FAN5_OVER_NOMINAL = '5101\n';

/**
 * `fan5_input` that read as nothing — a truncated SMM answer.
 *
 * `Number('')` is `0`, so this is the exact text that turns "the driver said nothing" into
 * "the fan is stopped". It must be `null` **and** carry an `errors[]` entry.
 */
export const DELL_SMM_FAN5_EMPTY = '\n';

/** A negative revolution count. Outside the quantity's domain: `null`, and no entry (§6.7). */
export const DELL_SMM_FAN5_NEGATIVE = '-1\n';

/*
 * The four `pwm5` texts HANDOVER O6 names by number: "0 and 255 are readings, −1 and 256
 * are `null`, and all four need fixtures". They are one character long and still deserve
 * names, because the point of each is which SIDE of the register boundary it sits on.
 */

/** The commissioned configuration: channel 5 driven HIGH. Top of the 0–255 register. */
export const PWM5_HIGH = '255\n';

/** Bottom of the register. ⚠ A reading — `OFF pwm 0` — and not the same as no reading. */
export const PWM5_OFF = '0\n';

/** One below the register. Not a duty: `null`, and no `errors[]` entry (§6.7). */
export const PWM5_BELOW_RANGE = '-1\n';

/** One above the register. §6.7 names this case with this value: "a `pwm5` of `999`". */
export const PWM5_ABOVE_RANGE = '256\n';

/** Three digits above it, which is §6.7's own example. */
export const PWM5_FAR_ABOVE_RANGE = '999\n';

/** A truncated read. `Number('')` is `0`, which would render the plausible `OFF pwm 0`. */
export const PWM5_EMPTY = '\n';

/**
 * The errno `pwm5` answers with while channel 5 is in **EC automatic control**, as captured
 * from the box 2026-09-06 (`os.read()` → errno 61, `ENODATA`, on the READ; `open()`
 * succeeds).
 *
 * ⚠ This is the healthy state (invariant 3) and it is what the live box was in at capture
 * time, both cards at 40 °C. Modelled as an errno rather than as text because that is how
 * it arrives: a rejection carrying `code: 'ENODATA'`.
 */
export const PWM5_EC_AUTO = 'ENODATA';

// ---------------------------------------------------------------------------
// Step 5 — §3.4 serving, §3.5 disk, §3.6 safety
// ---------------------------------------------------------------------------

/**
 * `ls /etc/llama-server`, verbatim, 2026-09-06. Two instances today (§3.4).
 *
 * ⚠ The list is the whole point: §3.4 says "a third card must appear without a code
 * change", so {@link LLAMA_SERVER_ENTRIES_THIRD_CARD} below is the acceptance fixture and
 * this one is only the baseline it is compared against.
 */
export const CAPTURED_LLAMA_SERVER_ENTRIES: readonly string[] = ['0.env', '1.env'];

/** `cat /etc/llama-server/0.env`, verbatim. Note `MODEL`/`ALIAS`/`FA`/`SPEC` are not read. */
export const CAPTURED_LLAMA_ENV_0 = `PORT=8080
MODEL=/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf
ALIAS=qwen3.6-27b
CTX=131072
FA=auto
SPEC=none
`;

/** `cat /etc/llama-server/1.env`, verbatim. Same model, different port — §3.4's live state. */
export const CAPTURED_LLAMA_ENV_1 = `PORT=8081
MODEL=/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf
ALIAS=qwen3.6-27b
CTX=131072
FA=auto
SPEC=none
`;

/** No `PORT=` at all: the instance cannot be probed, so §3.7's `health: null` is correct. */
export const LLAMA_ENV_NO_PORT = `MODEL=/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf
ALIAS=qwen3.6-27b
CTX=131072
`;

/** `PORT=` present and not a number. §6.7: `null` **with** an entry — the read failed. */
export const LLAMA_ENV_JUNK_PORT = `PORT=eight-thousand
CTX=131072
`;

/** `PORT=0` and `PORT=65536` — in format, outside the range. §6.7: `null`, **no** entry. */
export const LLAMA_ENV_PORT_ZERO = `PORT=0
CTX=131072
`;
export const LLAMA_ENV_PORT_OVER = `PORT=65536
CTX=131072
`;
/** The two sides of the port range that must be accepted (HANDOVER §5.1's symmetry rule). */
export const LLAMA_ENV_PORT_LOW = `PORT=1
CTX=1
`;
export const LLAMA_ENV_PORT_HIGH = `PORT=65535
CTX=131072
`;

/** Comments, blank lines, quoting and a duplicate key — all four things systemd tolerates. */
export const LLAMA_ENV_MESSY = `# written by serve-llm.sh

PORT=9999
  CTX = 4096
PORT="8080"
`;

/** A third card appears. §3.4's acceptance fixture: no code change, one more row. */
export const LLAMA_SERVER_ENTRIES_THIRD_CARD: readonly string[] = ['0.env', '1.env', '2.env'];

/** Sorted numerically, not lexically — `10.env` must not land between `0` and `1`. */
export const LLAMA_SERVER_ENTRIES_TENTH: readonly string[] = ['10.env', '0.env', '2.env'];

/** Files that are not instances, beside two that are. */
export const LLAMA_SERVER_ENTRIES_NOISY: readonly string[] = [
  '0.env',
  '1.env',
  'README',
  '0.env.bak.2026-09-04',
  'default.env',
  '01.env',
];

/** `curl -s http://127.0.0.1:8080/health`, verbatim (HTTP 200). */
export const CAPTURED_HEALTH_BODY = '{"status":"ok"}';

/** `curl -s http://127.0.0.1:8080/v1/models`, verbatim (HTTP 200). */
export const CAPTURED_MODELS_BODY =
  '{"models":[{"name":"qwen3.6-27b","model":"qwen3.6-27b","modified_at":"","size":"","digest":"","type":"model",' +
  '"description":"","tags":[""],"capabilities":["completion"],"parameters":"","details":{"parent_model":"",' +
  '"format":"gguf","family":"","families":[""],"parameter_size":"","quantization_level":""}}],"object":"list",' +
  '"data":[{"id":"qwen3.6-27b","aliases":["qwen3.6-27b"],"tags":[],"object":"model","created":1788745234,' +
  '"owned_by":"llamacpp","meta":{"vocab_type":2,"n_vocab":248320,"n_ctx":131072,"n_ctx_train":262144,' +
  '"n_embd":5120,"n_params":26895998464,"size":19084773376,"ftype":"Q4_K - Medium"}}]}';

/**
 * ⚠ **The 503 body, and the trap it is here to prove.** Transcribed from the running
 * build's own source — `middleware_server_state` in `tools/server/server-http.cpp`, read
 * over SSH 2026-09-06 — which sets `res.status = 503` and this body for **every** path
 * while `is_ready` is false. So `/v1/models` returns it too, and it must never be parsed as
 * a model list: it has no `data`, and doing so would file an `llama-models` entry blaming
 * the model list for a server that is merely still loading. That closes O15.
 */
export const LLAMA_LOADING_503_BODY = '{"error":{"message":"Loading model","type":"unavailable_error","code":503}}';

/** A 200 whose body is a model list with no entries. */
export const MODELS_BODY_EMPTY_DATA = '{"object":"list","data":[]}';
/** Two models on one instance — a state `ServingInstance.model` cannot express (gap S8). */
export const MODELS_BODY_TWO_MODELS =
  '{"object":"list","data":[{"id":"qwen3.6-27b"},{"id":"gemma-4-12b"}]}';
/** A 200 whose body is not JSON at all — an HTTP proxy or the wrong service on the port. */
export const MODELS_BODY_NOT_JSON = '<!doctype html><title>nginx</title>';
/** Valid JSON, no `data`. */
export const MODELS_BODY_NO_DATA = '{"object":"list"}';
/** `data[0].id` is a number, not a string — the shape that would throw in a naive parser. */
export const MODELS_BODY_NUMERIC_ID = '{"object":"list","data":[{"id":7}]}';

/**
 * `cat /etc/ufw/ufw.conf`, verbatim, 2026-09-06.
 *
 * ⚠ **`ENABLED=yes` — this box's firewall is now enforcing.** `CLAUDE.md` records it as
 * `no` from 2026-09-04, and §7's risk 3 and §6.4's standing-condition example both still
 * describe it that way. The check reads the file, so the dashboard reports whichever is
 * true on the day; the fixture is kept as captured.
 */
export const CAPTURED_UFW_CONF = `# /etc/ufw/ufw.conf
#

# Set to yes to start on boot. If setting this remotely, be sure to add a rule
# to allow your remote connection before starting ufw. Eg: 'ufw allow 22/tcp'
ENABLED=yes

# Please use the 'ufw' command to set the loglevel. Eg: 'ufw logging medium'.
# See 'man ufw' for details.
LOGLEVEL=low
`;

/** The same file as it read before 2026-09-06 — §6.3's alarm, and §6.4's standing example. */
export const UFW_CONF_DISABLED = CAPTURED_UFW_CONF.replace('ENABLED=yes', 'ENABLED=no');

/** ⚠ No `ENABLED=` line at all. **Absent is not disabled** — `null`, which §6.3 bands watch. */
export const UFW_CONF_NO_ENABLED = `# /etc/ufw/ufw.conf
LOGLEVEL=low
`;

/** `ENABLED=` present, value unrecognised. Conservative: `null`, never the `false` alarm. */
export const UFW_CONF_JUNK = `ENABLED=maybe
LOGLEVEL=low
`;

/** Commented out. A `#ENABLED=yes` is not an assignment and must not read as one. */
export const UFW_CONF_COMMENTED = `#ENABLED=yes
LOGLEVEL=low
`;

/** Shell sourcing means the LAST assignment wins — `ufw` itself would obey the second. */
export const UFW_CONF_TWICE = `ENABLED=yes
ENABLED=no
`;

/**
 * ⚠ The limit of `parseUfwConf`'s grammar, fixtured so it is a tested fact rather than a
 * claim in a doc comment.
 *
 * A shell would source every line below as `ENABLED=no`, and `ufw` would honour it. This
 * parser accepts only **the exact form `ufw` itself writes** — unquoted, uncommented, no
 * `export` — so all four read `null`: *watch*, "could not check", never the `false` that
 * §6.3 bands as an alarm. The direction is safe and the narrowness is deliberate; the
 * defect that was fixed here was a doc comment claiming the shell reading while the code
 * implemented this subset.
 */
export const UFW_CONF_QUOTED_NO = `ENABLED="no"
`;
export const UFW_CONF_SINGLE_QUOTED_NO = `ENABLED='no'
`;
export const UFW_CONF_TRAILING_COMMENT_NO = `ENABLED=no # off while I debug
`;
export const UFW_CONF_EXPORTED_NO = `export ENABLED=no
`;

/** `ls /lib/modules`, verbatim. Three kernels; `GRUB_DEFAULT=0` boots the newest. */
export const CAPTURED_LIB_MODULES: readonly string[] = [
  '7.0.0-14-generic',
  '7.0.0-29-generic',
  '7.0.0-30-generic',
];

/** `ls /lib/modules/7.0.0-30-generic/updates/dkms/`, verbatim. The 5-fan module is there. */
export const CAPTURED_DKMS_ENTRIES: readonly string[] = [
  'dell-smm-hwmon.ko.zst',
  'nvidia-drm.ko.zst',
  'nvidia-modeset.ko.zst',
  'nvidia-peermem.ko.zst',
  'nvidia-uvm.ko.zst',
  'nvidia.ko.zst',
];

/**
 * The same directory after a kernel upgrade with no `dkms install -k` — §3.6's alarm. The
 * NVIDIA modules are still there, which is what makes this distinguishable from a missing
 * mount: DKMS built *something* for this kernel, just not the one that gives `pwm5`.
 */
export const DKMS_ENTRIES_WITHOUT_MODULE: readonly string[] = CAPTURED_DKMS_ENTRIES.filter(
  (entry) => !entry.startsWith('dell-smm-hwmon.ko'),
);

/** The uncompressed name, in case a future kernel stops compressing modules. */
export const DKMS_ENTRIES_UNCOMPRESSED: readonly string[] = ['dell-smm-hwmon.ko'];

/**
 * Real D-Bus frames, captured from this box's **live system bus** on 2026-09-06 by
 * replaying this project's own encoder output over `/run/dbus/system_bus_socket` and
 * hexdumping what came back. Read-only throughout: SASL `EXTERNAL`, `Hello`,
 * `Manager.GetUnit`, `Properties.Get`. Nothing was loaded, started or written.
 *
 * ⚠ They are the reason the codec is trusted. A self-consistent encoder/decoder pair
 * round-trips happily while being wrong on the wire — and this one *was*: the `SIGNATURE`
 * header field was marshalled with a 4-byte length instead of a 1-byte one, systemd
 * accepted `Hello`, silently dropped the connection on the next frame, and every local
 * test still passed.
 */

/**
 * The reply to `Hello` — **two messages in one 262-byte read**: the `METHOD_RETURN`
 * carrying the unique name `:1.102`, immediately followed by the bus's `NameAcquired`
 * signal. A client that took "the next message" as its answer would read the signal as its
 * next reply and be wrong from then on.
 */
export const CAPTURED_DBUS_HELLO_REPLY =
  '6c0201010b000000010000003d00000006017300060000003a312e31303200000501750001000000080167000173000007017300' +
  '140000006f72672e667265656465736b746f702e4442757300000000060000003a312e313032006c0401010b000000020000008d' +
  '00000001016f00150000002f6f72672f667265656465736b746f702f4442757300000002017300140000006f72672e6672656564' +
  '65736b746f702e4442757300000000030173000c0000004e616d654163717569726564000000000601730006' +
  '0000003a312e3130320000080167000173000007017300140000006f72672e667265656465736b746f702e44427573000000000600' +
  '00003a312e31303200';

/** `Manager.GetUnit("llama-server@0.service")` → the unit's object path. */
export const CAPTURED_DBUS_GET_UNIT_REPLY =
  '6c020101400000007f3b00002d000000050175000200000006017300060000003a312e31303200000801670001' +
  '6f000007017300040000003a312e33000000003b0000002f6f72672f667265656465736b746f702f73797374656d64312f756e69742f' +
  '6c6c616d615f32647365727665725f3430305f32657365727669636500';

/** `Properties.Get(Unit, ActiveState)` → a `VARIANT` holding the string `active`. */
export const CAPTURED_DBUS_ACTIVE_STATE_REPLY =
  '6c0201010f000000803b00002d000000050175000300000006017300060000003a312e3130320000080167000176000007017300' +
  '040000003a312e3300000000017300000600000061637469766500';

/**
 * `Manager.GetUnit("llama-server@7.service")` for a unit that exists on disk but has never
 * been loaded → `ERROR org.freedesktop.systemd1.NoSuchUnit`, "Unit … not loaded."
 *
 * ⚠ `systemctl show -p ActiveState` prints `inactive` for the same unit, because it calls
 * `LoadUnit` — which loads it. Invariant 2 leaves only `GetUnit`, so this is the answer this
 * dashboard gets, and §6.3 would band the `inactive` it does *not* say as an alarm.
 */
export const CAPTURED_DBUS_NO_SUCH_UNIT_ERROR =
  '6c0301012c000000813b00005d000000050175000400000006017300060000003a312e31303200000401730023' +
  '0000006f72672e667265656465736b746f702e73797374656d64312e4e6f53756368556e69740000000000080167000173000007017300' +
  '040000003a312e330000000027000000556e6974206c6c616d612d73657276657240372e73657276696365206e6f74206c6f61646564' +
  '2e00';

/** The bus's SASL reply, verbatim, to the `AUTH EXTERNAL 31303030` this client sends. */
export const CAPTURED_DBUS_AUTH_OK = 'OK 4f150924d6632420d272f6c96a9ca54d\r\n';

/**
 * `os.statvfs()` on the two §2.2 mounts, 2026-09-06.
 *
 * ⚠ `blocks × bsize` and `(blocks − bfree) × bsize` reproduce `df -B1`'s **1B-blocks** and
 * **Used** columns to the byte: 249,792,131,072 / 22,153,736,192 for `/` and
 * 983,348,297,728 / 136,405,127,168 for `/home`. That equality is the check §6.6 asks for.
 */
export const CAPTURED_STATVFS_ROOT = { bsize: 4096, blocks: 60984407, bfree: 55575780 } as const;
export const CAPTURED_STATVFS_HOME = { bsize: 4096, blocks: 240075268, bfree: 206773235 } as const;
