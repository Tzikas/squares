// Copyright 2018 the Deno authors. All rights reserved. MIT license.

import { ReadResult, Reader, Writer, Closer } from "./io";
import * as fbs from "gen/msg_generated";
import { assert, notImplemented } from "./util";
import * as dispatch from "./dispatch";
import { flatbuffers } from "flatbuffers";
import { read, write, close } from "./files";

export type Network = "tcp";
// TODO support other types:
// export type Network = "tcp" | "tcp4" | "tcp6" | "unix" | "unixpacket";

// TODO Support finding network from Addr, see https://golang.org/pkg/net/#Addr
export type Addr = string;

/** A Listener is a generic network listener for stream-oriented protocols. */
export interface Listener {
  /** accept() waits for and returns the next connection to the Listener. */
  accept(): Promise<Conn>;

  /** Close closes the listener.
   * Any pending accept promises will be rejected with errors.
   */
  close(): void;

  addr(): Addr;
}

class ListenerImpl implements Listener {
  constructor(readonly fd: number) {}

  async accept(): Promise<Conn> {
    const builder = new flatbuffers.Builder();
    fbs.Accept.startAccept(builder);
    fbs.Accept.addRid(builder, this.fd);
    const msg = fbs.Accept.endAccept(builder);
    const baseRes = await dispatch.sendAsync(builder, fbs.Any.Accept, msg);
    assert(baseRes != null);
    assert(fbs.Any.NewConn === baseRes!.msgType());
    const res = new fbs.NewConn();
    assert(baseRes!.msg(res) != null);
    return new ConnImpl(res.rid(), res.remoteAddr()!, res.localAddr()!);
  }

  close(): void {
    close(this.fd);
  }

  addr(): Addr {
    return notImplemented();
  }
}

export interface Conn extends Reader, Writer, Closer {
  localAddr: string;
  remoteAddr: string;
}

class ConnImpl implements Conn {
  constructor(
    readonly fd: number,
    readonly remoteAddr: string,
    readonly localAddr: string
  ) {}

  write(p: ArrayBufferView): Promise<number> {
    return write(this.fd, p);
  }

  read(p: ArrayBufferView): Promise<ReadResult> {
    return read(this.fd, p);
  }

  close(): void {
    close(this.fd);
  }

  /** closeRead shuts down (shutdown(2)) the reading side of the TCP connection.
   * Most callers should just use close().
   */
  closeRead(): void {
    // TODO(ry) Connect to AsyncWrite::shutdown in resources.rs
    return notImplemented();
  }

  /** closeWrite shuts down (shutdown(2)) the writing side of the TCP
   * connection. Most callers should just use close().
   */
  closeWrite(): void {
    // TODO(ry) Connect to AsyncWrite::shutdown in resources.rs
    return notImplemented();
  }
}

/** Listen announces on the local network address.
 *
 * The network must be "tcp", "tcp4", "tcp6", "unix" or "unixpacket".
 *
 * For TCP networks, if the host in the address parameter is empty or a literal
 * unspecified IP address, Listen listens on all available unicast and anycast
 * IP addresses of the local system. To only use IPv4, use network "tcp4". The
 * address can use a host name, but this is not recommended, because it will
 * create a listener for at most one of the host's IP addresses. If the port in
 * the address parameter is empty or "0", as in "127.0.0.1:" or "[::1]:0", a
 * port number is automatically chosen. The Addr method of Listener can be used
 * to discover the chosen port.
 *
 * See dial() for a description of the network and address parameters.
 */
export function listen(network: Network, address: string): Listener {
  const builder = new flatbuffers.Builder();
  const network_ = builder.createString(network);
  const address_ = builder.createString(address);
  fbs.Listen.startListen(builder);
  fbs.Listen.addNetwork(builder, network_);
  fbs.Listen.addAddress(builder, address_);
  const msg = fbs.Listen.endListen(builder);
  const baseRes = dispatch.sendSync(builder, fbs.Any.Listen, msg);
  assert(baseRes != null);
  assert(fbs.Any.ListenRes === baseRes!.msgType());
  const res = new fbs.ListenRes();
  assert(baseRes!.msg(res) != null);
  return new ListenerImpl(res.rid());
}

/** Dial connects to the address on the named network.
 *
 * Supported networks are only "tcp" currently.
 * TODO: "tcp4" (IPv4-only), "tcp6" (IPv6-only), "udp", "udp4"
 * (IPv4-only), "udp6" (IPv6-only), "ip", "ip4" (IPv4-only), "ip6" (IPv6-only),
 * "unix", "unixgram" and "unixpacket".
 *
 * For TCP and UDP networks, the address has the form "host:port". The host must
 * be a literal IP address, or a host name that can be resolved to IP addresses.
 * The port must be a literal port number or a service name. If the host is a
 * literal IPv6 address it must be enclosed in square brackets, as in
 * "[2001:db8::1]:80" or "[fe80::1%zone]:80". The zone specifies the scope of
 * the literal IPv6 address as defined in RFC 4007. The functions JoinHostPort
 * and SplitHostPort manipulate a pair of host and port in this form. When using
 * TCP, and the host resolves to multiple IP addresses, Dial will try each IP
 * address in order until one succeeds.
 *
 * Examples:
 *
 *   dial("tcp", "golang.org:http")
 *   dial("tcp", "192.0.2.1:http")
 *   dial("tcp", "198.51.100.1:80")
 *   dial("udp", "[2001:db8::1]:domain")
 *   dial("udp", "[fe80::1%lo0]:53")
 *   dial("tcp", ":80")
 */
export async function dial(network: Network, address: string): Promise<Conn> {
  const builder = new flatbuffers.Builder();
  const network_ = builder.createString(network);
  const address_ = builder.createString(address);
  fbs.Dial.startDial(builder);
  fbs.Dial.addNetwork(builder, network_);
  fbs.Dial.addAddress(builder, address_);
  const msg = fbs.Dial.endDial(builder);
  const baseRes = await dispatch.sendAsync(builder, fbs.Any.Dial, msg);
  assert(baseRes != null);
  assert(fbs.Any.NewConn === baseRes!.msgType());
  const res = new fbs.NewConn();
  assert(baseRes!.msg(res) != null);
  return new ConnImpl(res.rid(), res.remoteAddr()!, res.localAddr()!);
}

// Unused but reserved op.
export async function connect(
  network: Network,
  address: string
): Promise<Conn> {
  return notImplemented();
}
