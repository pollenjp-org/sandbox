#!/usr/bin/env python3
#
# Use system python because bcc is installed in system python
import ctypes as ct

from bcc import BPF

program = r"""
/**
 * Define a program array to store the program IDs for the syscalls of interest
 * BPF_MAP_TYPE_PROG_ARRAY
 * system call tables: https://syscalls.mebeim.net/?table=x86/64/x64/latest
 * Now the number of syscalls is within 500, so we can use 500 as the size of the program array
 */
BPF_PROG_ARRAY(syscall, 500);


/**
 */
int hello(struct bpf_raw_tracepoint_args *ctx) {
    int opcode = ctx->args[1];
    syscall.call(ctx, opcode);
    bpf_trace_printk("Another syscall: %d", opcode);
    return 0;
}

int hello_exec(void *ctx) {
    bpf_trace_printk("Executing a program");
    return 0;
}

int hello_timer(struct bpf_raw_tracepoint_args *ctx) {
    int opcode = ctx->args[1];
    switch (opcode) {
        case 222:
            bpf_trace_printk("Creating a timer");
            break;
        case 226:
            bpf_trace_printk("Deleting a timer");
            break;
        default:
            bpf_trace_printk("Some other timer operation");
            break;
    }
    return 0;
}

int ignore_opcode(void *ctx) {
    return 0;
}
"""

b = BPF(text=program)
b.attach_raw_tracepoint(tp="sys_enter", fn_name="hello")

ignore_fn = b.load_func("ignore_opcode", BPF.RAW_TRACEPOINT)
exec_fn = b.load_func("hello_exec", BPF.RAW_TRACEPOINT)
timer_fn = b.load_func("hello_timer", BPF.RAW_TRACEPOINT)

prog_array = b.get_table("syscall")

# Ignore all syscalls initially
for i in range(len(prog_array)):
    prog_array[ct.c_int(i)] = ct.c_int(ignore_fn.fd)

# system call tables: https://syscalls.mebeim.net/?table=x86/64/x64/latest
prog_array[ct.c_int(59)] = ct.c_int(exec_fn.fd)
prog_array[ct.c_int(222)] = ct.c_int(timer_fn.fd)
prog_array[ct.c_int(223)] = ct.c_int(timer_fn.fd)
prog_array[ct.c_int(224)] = ct.c_int(timer_fn.fd)
prog_array[ct.c_int(225)] = ct.c_int(timer_fn.fd)
prog_array[ct.c_int(226)] = ct.c_int(timer_fn.fd)

b.trace_print()
